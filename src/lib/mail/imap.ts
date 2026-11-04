import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logger } from "@/lib/logger";
import type { ParsedInbound } from "./classify";
import { imapConfig, type ImapConfig } from "./mailbox";

const log = logger.child({ module: "imap" });

function client(cfg: ImapConfig) {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true, // ausschließlich TLS
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    socketTimeout: 120_000,
  });
}

export async function verifyImap(cfg: ImapConfig) {
  const c = client(cfg);
  await c.connect();
  try {
    const status = await c.status(cfg.folder, { messages: true, uidNext: true });
    return { messages: status ? (status.messages ?? 0) : 0 };
  } finally {
    await c.logout().catch(() => {});
  }
}

function addrList(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  return arr.flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);
}

export function toParsedInbound(m: ParsedMail): ParsedInbound {
  const headers: Record<string, string> = {};
  for (const [k, v] of m.headers) {
    if (typeof v === "string") headers[k.toLowerCase()] = v;
    else if (v && typeof v === "object" && "value" in v && typeof (v as { value: unknown }).value === "string") {
      const params = (v as { params?: Record<string, string> }).params ?? {};
      headers[k.toLowerCase()] = [(v as { value: string }).value, ...Object.entries(params).map(([pk, pv]) => `${pk}=${pv}`)].join("; ");
    }
  }
  const from = m.from?.value[0];
  const refs = Array.isArray(m.references) ? m.references : m.references ? [m.references] : [];
  return {
    messageId: m.messageId ?? null,
    inReplyTo: m.inReplyTo ?? null,
    references: refs,
    from: { address: (from?.address ?? "").toLowerCase(), name: from?.name || null },
    to: addrList(m.to),
    cc: addrList(m.cc),
    subject: m.subject ?? "(ohne Betreff)",
    text: m.text ?? "",
    html: typeof m.html === "string" ? m.html : null,
    date: m.date ?? null,
    headers,
    attachments: m.attachments.map((a) => ({ contentType: a.contentType, content: a.content, filename: a.filename ?? null })),
  };
}

/**
 * Holt neue Nachrichten (UID > last_uid) und übergibt sie an `ingest`.
 * Bei geänderter UIDVALIDITY wird ab den letzten 7 Tagen neu eingelesen (Duplikate werden erkannt).
 */
export async function syncMailbox(
  mailboxId: string,
  ingest: (mailboxId: string, p: ParsedInbound, uid: number) => Promise<unknown>,
  opts: { maxMessages?: number } = {},
) {
  const [mb] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, mailboxId));
  if (!mb) throw new Error("Postfach nicht gefunden");
  const cfg = imapConfig(mb);
  if (!cfg) {
    await db.update(schema.mailboxes).set({ lastSyncError: "IMAP nicht konfiguriert" }).where(eq(schema.mailboxes.id, mailboxId));
    return { fetched: 0 };
  }
  const c = client(cfg);
  let fetched = 0;
  let maxUid = mb.lastUid;
  try {
    await c.connect();
    const lock = await c.getMailboxLock(cfg.folder);
    try {
      const box = c.mailbox;
      const uidValidity = box && typeof box === "object" ? String(box.uidValidity) : null;
      let range: string | { since: Date };
      if (mb.lastUidValidity && uidValidity && mb.lastUidValidity !== uidValidity) {
        log.warn("UIDVALIDITY geändert – Neuabgleich der letzten 7 Tage", { mailboxId });
        maxUid = 0;
        range = { since: new Date(Date.now() - 7 * 86400_000) };
      } else if (mb.lastUid === 0) {
        // Erstsynchronisierung: nur die letzten 30 Tage
        range = { since: new Date(Date.now() - 30 * 86400_000) };
      } else {
        range = `${mb.lastUid + 1}:*`;
      }
      const uids = (typeof range === "string" ? await c.search({ uid: range }, { uid: true }) : await c.search(range, { uid: true })) || [];
      const todo = uids.filter((u) => u > (typeof range === "string" ? mb.lastUid : 0)).sort((a, b) => a - b).slice(0, opts.maxMessages ?? 200);
      for (const uid of todo) {
        const msg = await c.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        try {
          await ingest(mailboxId, toParsedInbound(parsed), uid);
          fetched++;
        } catch (err) {
          log.error("Nachricht konnte nicht verarbeitet werden", { mailboxId, uid, err });
        }
        maxUid = Math.max(maxUid, uid);
        await db.update(schema.mailboxes).set({ lastUid: maxUid }).where(eq(schema.mailboxes.id, mailboxId));
      }
      await db
        .update(schema.mailboxes)
        .set({ lastUid: maxUid, lastUidValidity: uidValidity, lastSyncAt: new Date(), lastSyncError: null })
        .where(eq(schema.mailboxes.id, mailboxId));
    } finally {
      lock.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.mailboxes).set({ lastSyncError: message.slice(0, 500), lastSyncAt: new Date() }).where(eq(schema.mailboxes.id, mailboxId));
    throw err;
  } finally {
    await c.logout().catch(() => {});
  }
  return { fetched };
}
