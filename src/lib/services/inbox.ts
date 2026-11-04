import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { aiStatus, analyzeReply, type ReplyAnalysis } from "@/lib/ai";
import { stripQuoted } from "@/lib/mail/classify";
import { logger } from "@/lib/logger";
import { enqueue, QUEUES } from "@/lib/queue";
import { logActivity } from "./audit";
import { setPermission } from "./permissions";

const log = logger.child({ module: "inbox" });

/**
 * Regelbasierte Erkennung von Abmeldewünschen. Wird IMMER ausgeführt (auch ohne KI),
 * weil ein Widerspruch gegen Werbung rechtlich zwingend zu beachten ist.
 */
const OPT_OUT = [
  /\b(bitte\s+)?(keine|nicht)\s+(weiteren?|mehr)\s+(e-?mails?|nachrichten|werbung|kontaktaufnahmen?|zusendungen)/i,
  /\b(aus\s+(ihrem|dem)\s+verteiler|vom\s+verteiler)\b/i,
  /\b(austragen|abmelden|abbestellen)\b/i,
  /\bwiderspreche\b|\bwiderspruch\b/i,
  /\b(unsubscribe|remove me|stop emailing|do not contact)\b/i,
  /\b(daten|adresse)\s+(bitte\s+)?löschen\b|\blöschen sie (meine|unsere)\b/i,
  /\bnicht\s+mehr\s+(kontaktieren|anschreiben)\b/i,
];

export function detectOptOut(text: string): boolean {
  const t = text.slice(0, 4000);
  return OPT_OUT.some((re) => re.test(t));
}

export async function analyzeMessageJob(messageId: string) {
  const [msg] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
  if (!msg || msg.direction !== "inbound") return { skipped: true };
  if (msg.aiAnalyzedAt) return { skipped: true, reason: "bereits analysiert" };
  const body = stripQuoted(msg.bodyText ?? "") || (msg.bodyText ?? "");
  const ruleOptOut = detectOptOut(`${msg.subject}\n${body}`);

  let analysis: (ReplyAnalysis & { source: "ai" | "rules" }) | null = null;
  if (aiStatus().connected) {
    const [company] = msg.companyId ? await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, msg.companyId)) : [];
    const [orig] = msg.inReplyTo
      ? await db.select({ subject: schema.emailMessages.subject }).from(schema.emailMessages).where(eq(schema.emailMessages.messageIdHeader, msg.inReplyTo))
      : [];
    const result = await analyzeReply({ subject: msg.subject, body, companyName: company?.name, originalSubject: orig?.subject });
    analysis = { ...result, source: "ai" };
  } else if (ruleOptOut) {
    analysis = {
      source: "rules",
      category: "unsubscribe",
      sentiment: "negative",
      confidence: 0.6,
      summary: "Regelbasiert erkannt: Der Absender möchte keine weiteren E-Mails erhalten.",
      objectToMarketing: true,
      requestedCallback: false,
      proposedDates: [],
      followUpDate: null,
      alternativeContact: null,
      nextAction: "Abmeldung bestätigen, keine weitere Werbung senden.",
    };
  }

  if (!analysis) {
    log.info("Keine KI verbunden – Analyse übersprungen", { messageId });
    return { skipped: true, reason: "KI nicht verbunden" };
  }
  const objection = analysis.objectToMarketing || analysis.category === "unsubscribe" || ruleOptOut;
  await applyReplyAnalysis(msg.id, analysis, objection);
  return { category: analysis.category, objection };
}

export async function applyReplyAnalysis(messageId: string, analysis: ReplyAnalysis & { source: "ai" | "rules" }, objection: boolean) {
  const [msg] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
  if (!msg) return;
  await db
    .update(schema.emailMessages)
    .set({ aiCategory: analysis.category, aiSentiment: analysis.sentiment, aiAnalysis: analysis, aiAnalyzedAt: new Date() })
    .where(eq(schema.emailMessages.id, messageId));

  if (objection) {
    await setPermission({
      email: msg.fromEmail,
      basis: "objected",
      contactId: msg.contactId,
      reason: `Widerspruch per E-Mail (${analysis.source === "ai" ? "KI-erkannt" : "regelbasiert erkannt"})`,
      evidence: `E-Mail vom ${msg.receivedAt?.toISOString() ?? ""}, Betreff „${msg.subject}“`,
      actorLabel: "System",
    });
    if (msg.contactId) await db.update(schema.contacts).set({ status: "blocked", updatedAt: new Date() }).where(eq(schema.contacts.id, msg.contactId));
    if (msg.recipientId) await db.update(schema.campaignRecipients).set({ status: "unsubscribed", nextSendAt: null }).where(eq(schema.campaignRecipients.id, msg.recipientId));
    await logActivity({ type: "permission_change", title: "Werbewiderspruch erfasst", body: analysis.summary, companyId: msg.companyId, contactId: msg.contactId, messageId });
  }

  await enqueue(QUEUES.automationEvent, {
    event: "reply.classified",
    eventKey: `classified:${messageId}`,
    companyId: msg.companyId,
    contactId: msg.contactId,
    messageId,
    data: { category: analysis.category, summary: analysis.summary, followUpDate: analysis.followUpDate },
  });
}
