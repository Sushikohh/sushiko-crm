import { and, asc, count, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { aiStatus, personalizeEmail } from "@/lib/ai";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { brevoConfigured } from "@/lib/mail/brevo";
import { getDefaultMailbox } from "@/lib/mail/mailbox";
import { isSenderIdentityComplete, renderTemplate, templateValues } from "@/lib/templates";
import { contactName } from "@/lib/utils";
import { notify } from "./audit";
import { queueEmail } from "./email";
import { eligibilityForContacts } from "./permissions";
import { getSetting } from "./settings";

const log = logger.child({ module: "campaigns" });

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2, "Name ist erforderlich"),
  description: z.string().trim().optional().nullable(),
  channel: z.enum(["smtp", "brevo"]).default("smtp"),
  mailboxId: z.string().uuid().optional().nullable(),
  targetIndustries: z.array(z.enum(INDUSTRY_KEYS as [IndustryKey, ...IndustryKey[]])).default([]),
  dailyLimit: z.coerce.number().int().min(1).max(500).default(40),
  sendWindowStart: z.coerce.number().int().min(0).max(23).default(8),
  sendWindowEnd: z.coerce.number().int().min(1).max(24).default(17),
  sendWeekdaysOnly: z.boolean().default(true),
  minDelaySeconds: z.coerce.number().int().min(10).max(3600).default(90),
  aiPersonalize: z.boolean().default(false),
  stopOnReply: z.boolean().default(true),
  steps: z
    .array(
      z.object({
        delayDays: z.coerce.number().int().min(0).max(90),
        subject: z.string().trim().min(1, "Betreff fehlt"),
        body: z.string().trim().min(10, "Text ist zu kurz"),
      }),
    )
    .min(1, "Mindestens ein Schritt ist erforderlich")
    .max(6),
});
export type CampaignInput = z.input<typeof campaignInputSchema>;

export async function saveCampaign(id: string | null, raw: CampaignInput, actorId: string) {
  const input = campaignInputSchema.parse(raw);
  if (input.sendWindowEnd <= input.sendWindowStart) throw new Error("Das Versandfenster ist ungültig.");
  return db.transaction(async (tx) => {
    const values = {
      name: input.name,
      description: input.description ?? null,
      channel: input.channel,
      mailboxId: input.mailboxId ?? null,
      targetIndustries: input.targetIndustries,
      dailyLimit: input.dailyLimit,
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
      sendWeekdaysOnly: input.sendWeekdaysOnly,
      minDelaySeconds: input.minDelaySeconds,
      aiPersonalize: input.aiPersonalize,
      stopOnReply: input.stopOnReply,
      updatedAt: new Date(),
    };
    let campaignId = id;
    if (campaignId) {
      await tx.update(schema.campaigns).set(values).where(eq(schema.campaigns.id, campaignId));
    } else {
      const [c] = await tx.insert(schema.campaigns).values({ ...values, ownerId: actorId }).returning({ id: schema.campaigns.id });
      campaignId = c.id;
    }
    const existing = await tx.select().from(schema.campaignSteps).where(eq(schema.campaignSteps.campaignId, campaignId)).orderBy(asc(schema.campaignSteps.stepOrder));
    for (let i = 0; i < input.steps.length; i++) {
      const s = input.steps[i];
      if (existing[i]) await tx.update(schema.campaignSteps).set({ delayDays: i === 0 ? 0 : s.delayDays, subject: s.subject, body: s.body }).where(eq(schema.campaignSteps.id, existing[i].id));
      else await tx.insert(schema.campaignSteps).values({ campaignId, stepOrder: i, delayDays: i === 0 ? 0 : s.delayDays, subject: s.subject, body: s.body });
    }
    const surplus = existing.slice(input.steps.length).map((s) => s.id);
    if (surplus.length) await tx.delete(schema.campaignSteps).where(inArray(schema.campaignSteps.id, surplus));
    return campaignId;
  });
}

/** Fügt Empfänger hinzu. Nicht berechtigte Kontakte werden mit Begründung als „übersprungen“ geführt. */
export async function addRecipients(campaignId: string, contactIds: string[]) {
  const unique = [...new Set(contactIds)];
  const elig = await eligibilityForContacts(unique);
  let added = 0;
  let skipped = 0;
  for (const id of unique) {
    const e = elig.get(id);
    if (!e) continue;
    const res = await db
      .insert(schema.campaignRecipients)
      .values({
        campaignId,
        contactId: id,
        status: e.allowed ? "pending" : "skipped",
        skipReason: e.allowed ? null : e.reasons.join("; "),
      })
      .onConflictDoNothing()
      .returning({ id: schema.campaignRecipients.id });
    if (res.length) {
      if (e.allowed) added++;
      else skipped++;
    }
  }
  return { added, skipped };
}

export async function campaignReadiness(campaignId: string) {
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!c) throw new Error("Kampagne nicht gefunden");
  const problems: string[] = [];
  const [{ steps }] = await db.select({ steps: count() }).from(schema.campaignSteps).where(eq(schema.campaignSteps.campaignId, campaignId));
  if (!steps) problems.push("Keine E-Mail-Schritte definiert");
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(schema.campaignRecipients)
    .where(and(eq(schema.campaignRecipients.campaignId, campaignId), inArray(schema.campaignRecipients.status, ["pending", "in_progress"])));
  if (!pending) problems.push("Keine versandberechtigten Empfänger");
  if (!isSenderIdentityComplete(await getSetting("sender_identity"))) problems.push("Absenderangaben (Impressum) fehlen – Einstellungen → Unternehmen");
  const mailbox = c.mailboxId ? (await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, c.mailboxId)))[0] : await getDefaultMailbox();
  if (!mailbox) problems.push("Kein Postfach verbunden");
  else if (c.channel === "smtp" && (!mailbox.smtpHost || !mailbox.smtpPasswordEnc)) problems.push("SMTP für das Postfach nicht konfiguriert");
  if (c.channel === "brevo" && !brevoConfigured()) problems.push("Brevo ist nicht verbunden (BREVO_API_KEY)");
  if (c.aiPersonalize && !aiStatus().connected) problems.push("KI-Personalisierung aktiviert, aber keine KI verbunden");
  return { campaign: c, problems, ready: problems.length === 0 };
}

export async function startCampaign(campaignId: string) {
  const r = await campaignReadiness(campaignId);
  if (!r.ready) throw new Error(r.problems.join(" · "));
  await db
    .update(schema.campaigns)
    .set({ status: "active", startedAt: r.campaign.startedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(schema.campaigns.id, campaignId));
  await db
    .update(schema.campaignRecipients)
    .set({ nextSendAt: new Date() })
    .where(and(eq(schema.campaignRecipients.campaignId, campaignId), eq(schema.campaignRecipients.status, "pending"), sql`${schema.campaignRecipients.nextSendAt} is null`));
}

export async function pauseCampaign(campaignId: string) {
  await db.update(schema.campaigns).set({ status: "paused", updatedAt: new Date() }).where(eq(schema.campaigns.id, campaignId));
  // Noch nicht versendete Nachrichten zurückhalten
  await db
    .update(schema.emailMessages)
    .set({ status: "cancelled", error: "Kampagne pausiert" })
    .where(and(eq(schema.emailMessages.campaignId, campaignId), eq(schema.emailMessages.status, "queued")));
}

export function berlinNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday"); // Mo, Di, ...
  return { hour: Number(get("hour")), isWeekend: weekday.startsWith("Sa") || weekday.startsWith("So"), date: `${get("year")}-${get("month")}-${get("day")}` };
}

export function inSendWindow(c: { sendWindowStart: number; sendWindowEnd: number; sendWeekdaysOnly: boolean }, d = new Date()) {
  const b = berlinNow(d);
  if (c.sendWeekdaysOnly && b.isWeekend) return false;
  return b.hour >= c.sendWindowStart && b.hour < c.sendWindowEnd;
}

/** Mitternacht (Europe/Berlin) des aktuellen Tages als UTC-Zeitpunkt. */
export function startOfBerlinDay(d = new Date()) {
  const { date } = berlinNow(d);
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const berlinHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(noonUtc));
  const offsetHours = berlinHour - 12; // MEZ: 1, MESZ: 2
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - offsetHours * 3600_000);
}

/**
 * Wird minütlich vom Worker ausgeführt. Reiht fällige Kampagnen-E-Mails unter Beachtung von
 * Versandfenster, Tageslimits, Mindestabstand und erneuter Rechtsprüfung ein.
 */
export async function campaignTick(now = new Date()) {
  const active = await db.select().from(schema.campaigns).where(eq(schema.campaigns.status, "active"));
  const identity = await getSetting("sender_identity");
  const result: Record<string, number> = {};
  for (const c of active) {
    if (!inSendWindow(c, now)) continue;
    const dayStart = startOfBerlinDay(now);
    const [{ sentToday }] = await db
      .select({ sentToday: count() })
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.campaignId, c.id), gte(schema.emailMessages.createdAt, dayStart), sql`${schema.emailMessages.status} <> 'cancelled'`));
    const mailbox = c.mailboxId ? (await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, c.mailboxId)))[0] : await getDefaultMailbox();
    if (!mailbox) continue;
    const [{ mailboxToday }] = await db
      .select({ mailboxToday: count() })
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.mailboxId, mailbox.id), eq(schema.emailMessages.direction, "outbound"), gte(schema.emailMessages.createdAt, dayStart)));
    // Pro Tick höchstens so viele, wie bis zum nächsten Tick im Mindestabstand möglich sind
    const perTick = Math.max(1, Math.floor(60 / c.minDelaySeconds) || 1);
    const capacity = Math.min(c.dailyLimit - sentToday, mailbox.dailyLimit - mailboxToday, perTick);
    if (capacity <= 0) continue;

    // Mindestabstand zur letzten Nachricht dieser Kampagne einhalten
    const [last] = await db
      .select({ at: sql<Date>`max(${schema.emailMessages.createdAt})` })
      .from(schema.emailMessages)
      .where(eq(schema.emailMessages.campaignId, c.id));
    if (last?.at && now.getTime() - new Date(last.at).getTime() < c.minDelaySeconds * 1000) continue;

    const due = await db
      .select()
      .from(schema.campaignRecipients)
      .where(
        and(
          eq(schema.campaignRecipients.campaignId, c.id),
          or(eq(schema.campaignRecipients.status, "pending"), eq(schema.campaignRecipients.status, "in_progress")),
          lte(schema.campaignRecipients.nextSendAt, now),
        ),
      )
      .orderBy(asc(schema.campaignRecipients.nextSendAt))
      .limit(capacity);
    if (!due.length) {
      const [{ open }] = await db
        .select({ open: count() })
        .from(schema.campaignRecipients)
        .where(and(eq(schema.campaignRecipients.campaignId, c.id), inArray(schema.campaignRecipients.status, ["pending", "in_progress"])));
      if (!open) {
        await db.update(schema.campaigns).set({ status: "completed", updatedAt: new Date() }).where(eq(schema.campaigns.id, c.id));
        await notify({ title: `Kampagne „${c.name}“ abgeschlossen`, link: `/kampagnen/${c.id}`, level: "success" });
      }
      continue;
    }
    const steps = await db.select().from(schema.campaignSteps).where(eq(schema.campaignSteps.campaignId, c.id)).orderBy(asc(schema.campaignSteps.stepOrder));
    const elig = await eligibilityForContacts(due.map((d) => d.contactId));
    let queued = 0;
    for (const [i, r] of due.entries()) {
      const step = steps[r.currentStep];
      if (!step) {
        await db.update(schema.campaignRecipients).set({ status: "completed", nextSendAt: null }).where(eq(schema.campaignRecipients.id, r.id));
        continue;
      }
      const e = elig.get(r.contactId);
      if (!e?.allowed || !e.email) {
        await db.update(schema.campaignRecipients).set({ status: "skipped", skipReason: e?.reasons.join("; ") ?? "Kontakt fehlt", nextSendAt: null }).where(eq(schema.campaignRecipients.id, r.id));
        continue;
      }
      try {
        const [row] = await db
          .select({ contact: schema.contacts, company: schema.companies })
          .from(schema.contacts)
          .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
          .where(eq(schema.contacts.id, r.contactId));
        const values = templateValues({
          contact: row.contact,
          company: { name: row.company?.name ?? "", district: row.company?.district, city: row.company?.city, industry: row.company?.industry },
          sender: { name: mailbox.fromName ?? identity?.companyName ?? "", company: identity?.companyName ?? "", phone: identity?.phone },
        });
        let subject = renderTemplate(step.subject, values);
        let body = renderTemplate(step.body, values);
        if (c.aiPersonalize && aiStatus().connected && row.company) {
          try {
            const draft = await personalizeEmail({
              subject,
              body,
              company: { name: row.company.name, industry: INDUSTRIES[row.company.industry], district: row.company.district, website: row.company.website, notes: row.company.notes },
              contact: { name: contactName(row.contact), position: row.contact.position },
            });
            subject = draft.subject || subject;
            body = draft.body || body;
          } catch (err) {
            log.warn("KI-Personalisierung fehlgeschlagen – Vorlage wird verwendet", { err, recipientId: r.id });
          }
        }
        const nextStep = steps[r.currentStep + 1];
        await queueEmail({
          kind: "campaign",
          to: e.email,
          subject,
          body,
          mailboxId: mailbox.id,
          channel: c.channel,
          contactId: r.contactId,
          companyId: row.contact.companyId,
          campaignId: c.id,
          campaignStepId: step.id,
          recipientId: r.id,
          userId: c.ownerId,
          idempotencyKey: `camp:${r.id}:step:${r.currentStep}`,
          scheduledAt: new Date(now.getTime() + i * c.minDelaySeconds * 1000),
        });
        await db
          .update(schema.campaignRecipients)
          .set({
            status: nextStep ? "in_progress" : "completed",
            currentStep: r.currentStep + 1,
            lastSentAt: now,
            nextSendAt: nextStep ? new Date(now.getTime() + nextStep.delayDays * 86400_000) : null,
          })
          .where(eq(schema.campaignRecipients.id, r.id));
        queued++;
      } catch (err) {
        log.error("Empfänger konnte nicht verarbeitet werden", { err, recipientId: r.id });
        await db.update(schema.campaignRecipients).set({ status: "failed", skipReason: err instanceof Error ? err.message : String(err) }).where(eq(schema.campaignRecipients.id, r.id));
      }
    }
    result[c.id] = queued;
  }
  return result;
}

export async function campaignStats(campaignId?: string) {
  const where = campaignId ? sql`campaign_id = ${campaignId}` : sql`campaign_id is not null`;
  const rows = await db.execute<{ campaign_id: string; sent: number; accepted: number; bounced: number; replies: number; positive: number }>(sql`
    select campaign_id,
      count(*) filter (where direction='outbound' and status in ('accepted','delivered','bounced'))::int as sent,
      count(*) filter (where direction='outbound' and status in ('accepted','delivered'))::int as accepted,
      count(*) filter (where direction='outbound' and status='bounced')::int as bounced,
      count(*) filter (where direction='inbound' and kind in ('reply','inbound'))::int as replies,
      count(*) filter (where direction='inbound' and ai_category in ('interested','meeting_request'))::int as positive
    from email_messages where ${where} group by campaign_id`);
  return new Map(rows.map((r) => [r.campaign_id, r]));
}
