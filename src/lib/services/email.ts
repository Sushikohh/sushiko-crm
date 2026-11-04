import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EmailMessage, Mailbox } from "@/db/schema";
import { evaluateCorrespondence } from "@/lib/compliance";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { BrevoError, mapBrevoEvent, sendBrevo } from "@/lib/mail/brevo";
import { detectAutoReply, detectBounce, normalizeMessageId, stripQuoted, subjectThreadKey, threadCandidates, type ParsedInbound } from "@/lib/mail/classify";
import { getDefaultMailbox, smtpConfig } from "@/lib/mail/mailbox";
import { isPermanentSmtpError, sendSmtp, type OutgoingMail, type SendResult } from "@/lib/mail/smtp";
import { normalizeEmail } from "@/lib/normalize";
import { enqueue, QUEUES } from "@/lib/queue";
import { legalFooterText, snippet, textToHtml, type SenderIdentity } from "@/lib/templates";
import { logActivity, notify } from "./audit";
import { eligibilityForContact, isSuppressed, setPermission, suppress } from "./permissions";
import { getSetting } from "./settings";

const log = logger.child({ module: "email" });

export class PermanentSendError extends Error {}

function messageIdFor(mailboxEmail: string) {
  const domain = mailboxEmail.split("@")[1] ?? "localhost";
  return `<${randomUUID()}@${domain}>`;
}

export function unsubscribeUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/u/${token}`;
}

/* ------------------------------------------------------------------ */
/* Ausgang                                                             */
/* ------------------------------------------------------------------ */

export type QueueEmailInput = {
  kind: "campaign" | "correspondence" | "reply";
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  mailboxId?: string | null;
  channel?: "smtp" | "brevo";
  contactId?: string | null;
  companyId?: string | null;
  campaignId?: string | null;
  campaignStepId?: string | null;
  recipientId?: string | null;
  userId?: string | null;
  inReplyToMessageId?: string | null; // interne ID der beantworteten Nachricht
  idempotencyKey?: string;
  scheduledAt?: Date | null;
};

/** Legt eine ausgehende Nachricht an und reiht den Versand-Job ein (idempotent über idempotencyKey). */
export async function queueEmail(input: QueueEmailInput): Promise<EmailMessage> {
  const to = normalizeEmail(input.to);
  if (!to) throw new PermanentSendError("Ungültige Empfängeradresse");
  const mailbox = input.mailboxId
    ? (await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, input.mailboxId)))[0]
    : await getDefaultMailbox();
  if (!mailbox) throw new PermanentSendError("Kein Postfach konfiguriert. Bitte unter Einstellungen → E-Mail ein Postfach verbinden.");

  if (input.idempotencyKey) {
    const [existing] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.idempotencyKey, input.idempotencyKey));
    if (existing) return existing;
  }

  let inReplyTo: string | null = null;
  let references: string | null = null;
  let threadKey: string | null = null;
  if (input.inReplyToMessageId) {
    const [parent] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, input.inReplyToMessageId));
    if (parent) {
      inReplyTo = parent.messageIdHeader;
      references = [parent.referencesHeader, parent.messageIdHeader].filter(Boolean).join(" ");
      threadKey = parent.threadKey;
    }
  }
  const messageIdHeader = messageIdFor(mailbox.email);
  const [msg] = await db
    .insert(schema.emailMessages)
    .values({
      direction: "outbound",
      kind: input.kind,
      status: "queued",
      mailboxId: mailbox.id,
      channel: input.channel ?? "smtp",
      campaignId: input.campaignId ?? null,
      campaignStepId: input.campaignStepId ?? null,
      recipientId: input.recipientId ?? null,
      contactId: input.contactId ?? null,
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      threadKey: threadKey ?? messageIdHeader.toLowerCase(),
      messageIdHeader: messageIdHeader.toLowerCase(),
      inReplyTo,
      referencesHeader: references,
      fromEmail: mailbox.email,
      fromName: mailbox.fromName,
      toEmails: [to],
      ccEmails: input.cc ?? [],
      subject: input.subject,
      bodyText: input.body,
      snippet: snippet(input.body),
      idempotencyKey: input.idempotencyKey ?? null,
      scheduledAt: input.scheduledAt ?? null,
      unsubscribeToken: input.kind === "campaign" ? randomToken(18) : null,
    })
    .onConflictDoNothing({ target: schema.emailMessages.idempotencyKey })
    .returning();
  if (!msg) {
    const [existing] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.idempotencyKey, input.idempotencyKey!));
    return existing;
  }
  await enqueue(QUEUES.sendEmail, { messageId: msg.id }, { singletonKey: `send:${msg.id}`, startAfter: input.scheduledAt ?? undefined });
  return msg;
}

function buildOutgoing(msg: EmailMessage, mailbox: Mailbox, identity: SenderIdentity | null, signature: string | null): OutgoingMail {
  const parts = [msg.bodyText ?? ""];
  if (signature) parts.push(signature);
  const unsub = msg.unsubscribeToken ? unsubscribeUrl(msg.unsubscribeToken) : undefined;
  if (identity) parts.push(legalFooterText(identity, unsub));
  const text = parts.filter(Boolean).join("\n\n");
  const headers: Record<string, string> = {};
  if (msg.kind === "campaign" && unsub) {
    headers["List-Unsubscribe"] = `<${unsub}>, <mailto:${mailbox.email}?subject=Abmelden>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  headers["X-CRM-Message"] = msg.id;
  return {
    from: { name: msg.fromName ?? mailbox.fromName, address: mailbox.email },
    to: msg.toEmails,
    cc: msg.ccEmails,
    subject: msg.subject,
    text,
    html: textToHtml(text),
    messageId: msg.messageIdHeader ?? messageIdFor(mailbox.email),
    inReplyTo: msg.inReplyTo,
    references: msg.referencesHeader,
    headers,
  };
}

/**
 * Worker: verarbeitet einen Versand-Job. Idempotent durch atomaren Statuswechsel queued → sending.
 * Wirft bei vorübergehenden Fehlern (Retry durch die Queue), nicht bei permanenten.
 */
export async function processSendJob(messageId: string): Promise<{ status: string }> {
  const [claimed] = await db
    .update(schema.emailMessages)
    .set({ status: "sending", attempts: sql`${schema.emailMessages.attempts} + 1` })
    .where(and(eq(schema.emailMessages.id, messageId), eq(schema.emailMessages.status, "queued")))
    .returning();
  if (!claimed) {
    const [m] = await db.select({ status: schema.emailMessages.status }).from(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
    return { status: m?.status ?? "missing" };
  }
  const fail = async (status: "failed" | "cancelled", error: string) => {
    await db.update(schema.emailMessages).set({ status, error }).where(eq(schema.emailMessages.id, messageId));
    if (claimed.recipientId)
      await db.update(schema.campaignRecipients).set({ status: "skipped", skipReason: error }).where(eq(schema.campaignRecipients.id, claimed.recipientId));
    return { status };
  };

  try {
    const to = claimed.toEmails[0];
    // Rechtliche Prüfung unmittelbar vor dem Versand (Status kann sich seit dem Einreihen geändert haben)
    if (claimed.kind === "campaign") {
      if (!claimed.contactId) return fail("cancelled", "Kampagnen-E-Mail ohne Kontakt");
      const elig = await eligibilityForContact(claimed.contactId);
      if (!elig?.allowed || elig.email !== normalizeEmail(to)) return fail("cancelled", `Versand gestoppt: ${elig?.reasons.join("; ") ?? "Kontakt nicht gefunden"}`);
    } else {
      const check = evaluateCorrespondence({ email: to, suppressed: await isSuppressed(to), isReply: !!claimed.inReplyTo });
      if (!check.allowed) return fail("cancelled", check.reasons.join("; "));
    }

    const [mailbox] = claimed.mailboxId ? await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, claimed.mailboxId)) : [];
    if (!mailbox) return fail("failed", "Postfach nicht gefunden");
    const identity = await getSetting("sender_identity");
    const [sender] = claimed.userId
      ? await db.select({ sig: schema.profiles.emailSignature }).from(schema.profiles).where(eq(schema.profiles.id, claimed.userId))
      : [];
    const mail = buildOutgoing(claimed, mailbox, identity, sender?.sig ?? null);

    let result: SendResult;
    if (claimed.channel === "brevo") {
      result = await sendBrevo(mail);
    } else {
      const cfg = smtpConfig(mailbox);
      if (!cfg) return fail("failed", "SMTP ist für dieses Postfach nicht konfiguriert");
      result = await sendSmtp(cfg, mail);
    }

    const accepted = result.accepted.map((a) => a.toLowerCase()).includes(to.toLowerCase());
    await db
      .update(schema.emailMessages)
      .set({
        status: accepted ? "accepted" : "bounced",
        sentAt: new Date(),
        smtpResponse: result.response.slice(0, 1000),
        providerMessageId: result.providerMessageId ?? null,
        bouncedAt: accepted ? null : new Date(),
        bounceType: accepted ? null : "hard",
        error: accepted ? null : `Vom Server abgelehnt: ${result.rejected.join(", ")}`,
      })
      .where(eq(schema.emailMessages.id, messageId));
    await db.insert(schema.emailEvents).values({
      messageId,
      type: accepted ? "accepted" : "rejected",
      provider: claimed.channel ?? "smtp",
      providerEventId: `send:${messageId}`,
      email: to,
      payload: { response: result.response },
    }).onConflictDoNothing();

    if (accepted) await afterAccepted(claimed);
    else await applyHardBounce(claimed, to, result.response);
    return { status: accepted ? "accepted" : "bounced" };
  } catch (err) {
    const permanent = err instanceof PermanentSendError || isPermanentSmtpError(err) || (err instanceof BrevoError && err.permanent);
    const message = err instanceof Error ? err.message : String(err);
    if (permanent) {
      log.warn("Permanenter Versandfehler", { messageId, error: message });
      await db.update(schema.emailMessages).set({ status: "bounced", error: message, bouncedAt: new Date(), bounceType: "hard" }).where(eq(schema.emailMessages.id, messageId));
      await applyHardBounce(claimed, claimed.toEmails[0], message);
      return { status: "bounced" };
    }
    // Vorübergehend: zurück in die Warteschlange, Queue wiederholt mit Backoff
    await db.update(schema.emailMessages).set({ status: "queued", error: message }).where(eq(schema.emailMessages.id, messageId));
    if (claimed.attempts >= 5) {
      await db.update(schema.emailMessages).set({ status: "failed" }).where(eq(schema.emailMessages.id, messageId));
      await notify({ title: "E-Mail-Versand endgültig fehlgeschlagen", body: `${claimed.subject} → ${claimed.toEmails[0]}: ${message}`, level: "error", link: "/postfach" });
      return { status: "failed" };
    }
    throw err;
  }
}

async function afterAccepted(msg: EmailMessage) {
  const early = ["new", "not_contacted", "contact_planned"] as const;
  if (msg.contactId) {
    await db
      .update(schema.contacts)
      .set({ status: "contacted", updatedAt: new Date() })
      .where(and(eq(schema.contacts.id, msg.contactId), inArray(schema.contacts.status, [...early])));
  }
  if (msg.companyId) {
    await db
      .update(schema.companies)
      .set({ status: "contacted", updatedAt: new Date() })
      .where(and(eq(schema.companies.id, msg.companyId), inArray(schema.companies.status, [...early])));
  }
  await logActivity({
    type: "email_out",
    title: `E-Mail gesendet: ${msg.subject}`,
    body: snippet(msg.bodyText, 300),
    companyId: msg.companyId,
    contactId: msg.contactId,
    messageId: msg.id,
    userId: msg.userId,
    meta: { campaignId: msg.campaignId },
  });
}

async function applyHardBounce(msg: Pick<EmailMessage, "id" | "recipientId" | "contactId" | "companyId" | "campaignId">, email: string, details: string) {
  await suppress(email, "Hard Bounce", details.slice(0, 500));
  if (msg.recipientId) await db.update(schema.campaignRecipients).set({ status: "bounced" }).where(eq(schema.campaignRecipients.id, msg.recipientId));
  await logActivity({ type: "system", title: `E-Mail unzustellbar: ${email}`, body: details.slice(0, 500), companyId: msg.companyId, contactId: msg.contactId, messageId: msg.id });
  await enqueue(QUEUES.automationEvent, {
    event: "email.bounced",
    eventKey: `bounce:${msg.id}`,
    companyId: msg.companyId,
    contactId: msg.contactId,
    messageId: msg.id,
    data: { email, details: details.slice(0, 300) },
  });
}

/* ------------------------------------------------------------------ */
/* Eingang                                                             */
/* ------------------------------------------------------------------ */

async function findOutboundByMessageIds(ids: string[]) {
  if (!ids.length) return null;
  const [m] = await db
    .select()
    .from(schema.emailMessages)
    .where(and(inArray(schema.emailMessages.messageIdHeader, ids), eq(schema.emailMessages.direction, "outbound")))
    .orderBy(desc(schema.emailMessages.createdAt))
    .limit(1);
  return m ?? null;
}

async function findAnyByMessageIds(ids: string[]) {
  if (!ids.length) return null;
  const [m] = await db.select().from(schema.emailMessages).where(inArray(schema.emailMessages.messageIdHeader, ids)).limit(1);
  return m ?? null;
}

/**
 * Speichert eine eingehende Nachricht, ordnet sie Thread/Kontakt/Firma zu und erkennt
 * Bounces und Abwesenheitsnotizen. Idempotent über (Postfach, Message-ID).
 */
export async function ingestInbound(mailboxId: string, p: ParsedInbound, uid?: number): Promise<{ id: string; kind: string } | null> {
  const msgIdHeader = normalizeMessageId(p.messageId) ?? `<uid-${uid}-${mailboxId}@imap.local>`;
  const [dupe] = await db
    .select({ id: schema.emailMessages.id })
    .from(schema.emailMessages)
    .where(and(eq(schema.emailMessages.mailboxId, mailboxId), eq(schema.emailMessages.messageIdHeader, msgIdHeader), eq(schema.emailMessages.direction, "inbound")))
    .limit(1);
  if (dupe) return null;

  const bounce = detectBounce(p);
  const auto = !bounce.isBounce && detectAutoReply(p);
  const fromEmail = normalizeEmail(p.from.address) ?? p.from.address.toLowerCase();

  let parent = bounce.isBounce && bounce.originalMessageId ? await findOutboundByMessageIds([bounce.originalMessageId]) : null;
  if (!parent) parent = await findOutboundByMessageIds(threadCandidates(p));
  const anyParent = parent ?? (await findAnyByMessageIds(threadCandidates(p)));

  let contactId = parent?.contactId ?? anyParent?.contactId ?? null;
  let companyId = parent?.companyId ?? anyParent?.companyId ?? null;
  if (!contactId && !bounce.isBounce) {
    const [c] = await db
      .select({ id: schema.contacts.id, companyId: schema.contacts.companyId })
      .from(schema.contacts)
      .where(sql`lower(${schema.contacts.email}) = ${fromEmail}`)
      .limit(1);
    if (c) {
      contactId = c.id;
      companyId = companyId ?? c.companyId;
    }
  }
  if (!companyId && !bounce.isBounce) {
    const domain = fromEmail.split("@")[1];
    const [co] = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(and(eq(schema.companies.domain, domain ?? ""), isNull(schema.companies.mergedIntoId)))
      .limit(1);
    if (co) companyId = co.id;
  }

  const kind = bounce.isBounce ? "bounce" : auto ? "auto_reply" : parent ? "reply" : "inbound";
  const [row] = await db
    .insert(schema.emailMessages)
    .values({
      direction: "inbound",
      kind,
      status: "received",
      mailboxId,
      campaignId: parent?.campaignId ?? null,
      recipientId: parent?.recipientId ?? null,
      contactId,
      companyId,
      threadKey: anyParent?.threadKey ?? `subj:${subjectThreadKey(p.subject)}:${fromEmail}`,
      messageIdHeader: msgIdHeader,
      inReplyTo: normalizeMessageId(p.inReplyTo),
      referencesHeader: p.references.join(" ") || null,
      fromEmail,
      fromName: p.from.name,
      toEmails: p.to,
      ccEmails: p.cc,
      subject: p.subject,
      bodyText: p.text,
      bodyHtml: p.html,
      snippet: snippet(stripQuoted(p.text)),
      imapUid: uid ?? null,
      receivedAt: p.date ?? new Date(),
      isRead: bounce.isBounce || auto,
    })
    .returning();

  if (bounce.isBounce) {
    await handleBounce(row.id, parent, bounce.recipient ?? parent?.toEmails[0] ?? null, bounce.type ?? "hard", [bounce.statusCode, bounce.diagnostic].filter(Boolean).join(" "));
    return { id: row.id, kind };
  }
  if (auto) {
    await logActivity({ type: "email_in", title: `Abwesenheitsnotiz: ${p.subject}`, companyId, contactId, messageId: row.id });
    return { id: row.id, kind };
  }

  // Echte Antwort: Sequenz stoppen, Aktivität, Benachrichtigung, KI-Analyse
  if (parent?.recipientId) {
    const [camp] = parent.campaignId
      ? await db.select({ stop: schema.campaigns.stopOnReply }).from(schema.campaigns).where(eq(schema.campaigns.id, parent.campaignId))
      : [];
    if (camp?.stop !== false) {
      await db.update(schema.campaignRecipients).set({ status: "replied", nextSendAt: null }).where(eq(schema.campaignRecipients.id, parent.recipientId));
    }
  }
  await logActivity({ type: "email_in", title: `Antwort erhalten: ${p.subject}`, body: snippet(stripQuoted(p.text), 400), companyId, contactId, messageId: row.id });
  await notify({
    title: kind === "reply" ? "Neue Antwort auf Ihre E-Mail" : "Neue E-Mail",
    body: `${p.from.name ?? fromEmail}: ${p.subject}`,
    link: `/postfach?m=${row.id}`,
    level: "info",
  });
  await enqueue(QUEUES.analyzeReply, { messageId: row.id }, { singletonKey: `analyze:${row.id}` });
  await enqueue(QUEUES.automationEvent, {
    event: "reply.received",
    eventKey: `reply:${row.id}`,
    companyId,
    contactId,
    messageId: row.id,
    data: { kind, campaignId: parent?.campaignId ?? null },
  });
  return { id: row.id, kind };
}

async function handleBounce(bounceMsgId: string, original: EmailMessage | null, email: string | null, type: "hard" | "soft", details: string) {
  if (original) {
    await db
      .update(schema.emailMessages)
      .set({ status: "bounced", bouncedAt: new Date(), bounceType: type, error: details.slice(0, 500) || "Unzustellbar" })
      .where(eq(schema.emailMessages.id, original.id));
    await db
      .insert(schema.emailEvents)
      .values({ messageId: original.id, type: `${type}_bounce`, provider: "dsn", providerEventId: `dsn:${bounceMsgId}`, email, payload: { details } })
      .onConflictDoNothing();
    await db.update(schema.emailMessages).set({ contactId: original.contactId, companyId: original.companyId }).where(eq(schema.emailMessages.id, bounceMsgId));
  }
  if (email && type === "hard") {
    await applyHardBounce(
      { id: original?.id ?? bounceMsgId, recipientId: original?.recipientId ?? null, contactId: original?.contactId ?? null, companyId: original?.companyId ?? null, campaignId: original?.campaignId ?? null },
      email,
      details || "Unzustellbar",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Abmeldung & Brevo-Ereignisse                                        */
/* ------------------------------------------------------------------ */

export async function unsubscribeByToken(token: string, meta: { ip?: string | null; method: string }) {
  const [msg] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.unsubscribeToken, token)).limit(1);
  if (!msg) return null;
  const email = msg.toEmails[0];
  await setPermission({
    email,
    basis: "objected",
    contactId: msg.contactId,
    reason: `Abmeldung über Link (${meta.method})`,
    evidence: `Token ${token.slice(0, 6)}…, IP ${meta.ip ?? "unbekannt"}, ${new Date().toISOString()}`,
    actorLabel: "Empfänger",
  });
  if (msg.recipientId) await db.update(schema.campaignRecipients).set({ status: "unsubscribed", nextSendAt: null }).where(eq(schema.campaignRecipients.id, msg.recipientId));
  if (msg.contactId) await db.update(schema.contacts).set({ status: "blocked", updatedAt: new Date() }).where(eq(schema.contacts.id, msg.contactId));
  await logActivity({ type: "permission_change", title: `Abmeldung von Werbe-E-Mails: ${email}`, companyId: msg.companyId, contactId: msg.contactId, messageId: msg.id });
  await notify({ title: "Abmeldung eingegangen", body: email, level: "warning", link: msg.contactId ? `/ansprechpartner/${msg.contactId}` : undefined });
  return { email };
}

export type BrevoWebhookEvent = { event: string; email: string; id?: number | string; "message-id"?: string; date?: string; ts_event?: number; reason?: string };

export async function processBrevoEvent(ev: BrevoWebhookEvent) {
  const type = mapBrevoEvent(ev.event);
  const providerMessageId = ev["message-id"] ?? null;
  const [msg] = providerMessageId
    ? await db
        .select()
        .from(schema.emailMessages)
        .where(sql`${schema.emailMessages.providerMessageId} = ${providerMessageId} or ${schema.emailMessages.messageIdHeader} = ${providerMessageId.toLowerCase()}`)
        .limit(1)
    : [];
  const eventId = `${ev.event}:${providerMessageId ?? ev.email}:${ev.ts_event ?? ev.date ?? ev.id ?? ""}`;
  const inserted = await db
    .insert(schema.emailEvents)
    .values({ messageId: msg?.id ?? null, type, provider: "brevo", providerEventId: eventId, email: ev.email, payload: ev as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: schema.emailEvents.id });
  if (!inserted.length) return { duplicate: true };

  if (msg) {
    if (type === "delivered" && msg.status === "accepted") await db.update(schema.emailMessages).set({ status: "delivered" }).where(eq(schema.emailMessages.id, msg.id));
    if (type === "hard_bounce" || type === "blocked") {
      await db.update(schema.emailMessages).set({ status: "bounced", bouncedAt: new Date(), bounceType: "hard", error: ev.reason ?? type }).where(eq(schema.emailMessages.id, msg.id));
      await applyHardBounce(msg, ev.email, ev.reason ?? type);
    }
    if (type === "soft_bounce") await db.update(schema.emailMessages).set({ bounceType: "soft", error: ev.reason ?? "Soft Bounce" }).where(eq(schema.emailMessages.id, msg.id));
  }
  if (type === "unsubscribed" || type === "complaint") {
    await setPermission({
      email: ev.email,
      basis: "objected",
      contactId: msg?.contactId ?? null,
      reason: type === "complaint" ? "Spam-Beschwerde (Brevo)" : "Abmeldung (Brevo)",
      actorLabel: "Brevo-Webhook",
    });
  }
  return { duplicate: false, type };
}

export async function markRead(ids: string[], read = true) {
  if (!ids.length) return;
  await db.update(schema.emailMessages).set({ isRead: read }).where(inArray(schema.emailMessages.id, ids));
}
