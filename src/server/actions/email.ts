"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiStatus, draftReply, type ReplyAnalysis } from "@/lib/ai";
import { stripQuoted } from "@/lib/mail/classify";
import { enqueue, QUEUES } from "@/lib/queue";
import { queueEmail, markRead } from "@/lib/services/email";
import { listMailboxes } from "@/lib/mail/mailbox";
import { normalizeEmail } from "@/lib/normalize";
import { run } from "@/server/action";

const sendSchema = z.object({
  to: z.string().trim().refine((v) => !!normalizeEmail(v), "Ungültige Empfängeradresse"),
  subject: z.string().trim().min(1, "Betreff fehlt").max(300),
  body: z.string().trim().min(1, "Text fehlt").max(50_000),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  replyToMessageId: z.string().uuid().optional().nullable(),
  mailboxId: z.string().uuid().optional().nullable(),
  confirmNotAdvertising: z.boolean().optional(),
});

/**
 * Geschäftliche Einzelkorrespondenz bzw. Antwort. Werbung ist hierüber nicht zulässig –
 * bei neuen Nachrichten (keine Antwort) muss das ausdrücklich bestätigt werden.
 */
export async function sendEmailAction(raw: z.input<typeof sendSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = sendSchema.parse(raw);
    const isReply = !!v.replyToMessageId;
    if (!isReply && !v.confirmNotAdvertising)
      throw new Error("Bitte bestätigen Sie, dass es sich um keine Werbung handelt. Werbe-E-Mails nur über Kampagnen mit nachgewiesener Einwilligung.");
    let contactId = v.contactId ?? null;
    let companyId = v.companyId ?? null;
    if (isReply) {
      const [parent] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, v.replyToMessageId!));
      contactId = contactId ?? parent?.contactId ?? null;
      companyId = companyId ?? parent?.companyId ?? null;
      if (parent) await markRead([parent.id]);
    }
    const msg = await queueEmail({
      kind: isReply ? "reply" : "correspondence",
      to: v.to,
      subject: v.subject,
      body: v.body,
      contactId,
      companyId,
      userId: me.id,
      mailboxId: v.mailboxId ?? null,
      inReplyToMessageId: v.replyToMessageId ?? null,
    });
    revalidatePath("/postfach");
    if (companyId) revalidatePath(`/unternehmen/${companyId}`);
    return msg.id;
  }, "E-Mail wird gesendet");
}

export async function aiDraftReplyAction(messageId: string, instructions?: string) {
  const me = await requireUser();
  return run(async () => {
    if (!aiStatus().connected) throw new Error("KI ist nicht verbunden.");
    const [msg] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
    if (!msg) throw new Error("Nachricht nicht gefunden");
    const thread = msg.threadKey
      ? await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.threadKey, msg.threadKey)).orderBy(asc(schema.emailMessages.createdAt))
      : [msg];
    const draft = await draftReply({
      thread: thread.map((m) => ({ from: m.direction === "outbound" ? "Wir" : (m.fromName ?? m.fromEmail), date: (m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString().slice(0, 10), body: stripQuoted(m.bodyText ?? "") })),
      analysis: (msg.aiAnalysis as ReplyAnalysis | null) ?? null,
      senderName: me.fullName,
      instructions,
    });
    return draft;
  });
}

export async function markReadAction(ids: string[], read = true) {
  await requireUser();
  return run(async () => {
    await markRead(ids, read);
    revalidatePath("/postfach");
  });
}

export async function assignMessageAction(messageId: string, contactId: string | null, companyId: string | null) {
  await requireUser();
  return run(async () => {
    let co = companyId;
    if (contactId && !co) {
      const [c] = await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(eq(schema.contacts.id, contactId));
      co = c?.companyId ?? null;
    }
    const [m] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
    if (!m) throw new Error("Nachricht nicht gefunden");
    // Ganzen Thread zuordnen
    const where = m.threadKey ? eq(schema.emailMessages.threadKey, m.threadKey) : eq(schema.emailMessages.id, messageId);
    await db.update(schema.emailMessages).set({ contactId, companyId: co }).where(where);
    revalidatePath("/postfach");
    if (co) revalidatePath(`/unternehmen/${co}`);
  }, "Zugeordnet");
}

export async function reanalyzeAction(messageId: string) {
  await requireUser();
  return run(async () => {
    if (!aiStatus().connected) throw new Error("KI ist nicht verbunden.");
    await db.update(schema.emailMessages).set({ aiAnalyzedAt: null }).where(eq(schema.emailMessages.id, messageId));
    await enqueue(QUEUES.analyzeReply, { messageId }, { singletonKey: `analyze:${messageId}:${Date.now()}` });
  }, "Analyse gestartet");
}

export async function syncNowAction() {
  await requireUser();
  return run(async () => {
    const boxes = await listMailboxes();
    for (const b of boxes.filter((x) => x.active)) await enqueue(QUEUES.syncMailbox, { mailboxId: b.id }, { singletonKey: `sync:${b.id}`, singletonSeconds: 30 });
    return boxes.length;
  }, "Synchronisierung angestoßen");
}

export async function cancelQueuedAction(ids: string[]) {
  await requireUser();
  return run(async () => {
    await db
      .update(schema.emailMessages)
      .set({ status: "cancelled", error: "Manuell abgebrochen" })
      .where(and(inArray(schema.emailMessages.id, ids), eq(schema.emailMessages.status, "queued")));
    revalidatePath("/postfach");
  }, "Abgebrochen");
}
