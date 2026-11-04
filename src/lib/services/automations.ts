import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ACQ_STATUS_KEYS, DEAL_STAGE_KEYS, DEAL_STAGES, type AcqStatus, type DealStageKey } from "@/lib/constants";
import { logger } from "@/lib/logger";
import type { AutomationEventPayload, AutomationTrigger } from "@/lib/queue";
import { logActivity, notify } from "./audit";
import { setCompanyStatus } from "./companies";

const log = logger.child({ module: "automations" });

export const TRIGGERS: Record<AutomationTrigger, { label: string; description: string }> = {
  "reply.received": { label: "Antwort eingegangen", description: "Eine echte Antwort (keine Abwesenheitsnotiz) wurde empfangen" },
  "reply.classified": { label: "Antwort von KI eingeordnet", description: "Nach der KI-Analyse einer Antwort, filterbar nach Kategorie" },
  "email.bounced": { label: "E-Mail unzustellbar", description: "Hard Bounce oder Ablehnung durch den Empfängerserver" },
  "contact.status_changed": { label: "Akquisestatus geändert", description: "Status eines Unternehmens wurde geändert" },
  "deal.stage_changed": { label: "Pipeline-Phase geändert", description: "Ein Deal wurde in eine andere Phase verschoben" },
  "offer.accepted": { label: "Angebot angenommen", description: "Ein Angebot wurde als angenommen markiert" },
  "campaign.no_response": { label: "Keine Antwort nach Sequenz", description: "Sequenz beendet, keine Antwort innerhalb der eingestellten Frist" },
};

export const conditionsSchema = z.object({
  categories: z.array(z.string()).optional(),
  toStatus: z.array(z.enum(ACQ_STATUS_KEYS as [AcqStatus, ...AcqStatus[]])).optional(),
  toStage: z.array(z.enum(DEAL_STAGE_KEYS as [DealStageKey, ...DealStageKey[]])).optional(),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_company_status"), status: z.enum(ACQ_STATUS_KEYS as [AcqStatus, ...AcqStatus[]]) }),
  z.object({ type: z.literal("set_contact_status"), status: z.enum(ACQ_STATUS_KEYS as [AcqStatus, ...AcqStatus[]]) }),
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1),
    taskType: z.enum(["task", "call", "follow_up", "email", "site_visit"]).default("task"),
    dueInDays: z.coerce.number().int().min(0).max(365).default(1),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
  }),
  z.object({ type: z.literal("notify"), title: z.string().min(1) }),
  z.object({ type: z.literal("ensure_deal"), stage: z.enum(DEAL_STAGE_KEYS as [DealStageKey, ...DealStageKey[]]) }),
  z.object({ type: z.literal("set_follow_up"), days: z.coerce.number().int().min(1).max(730).default(90), useSuggestedDate: z.boolean().default(true) }),
]);
export type AutomationAction = z.infer<typeof actionSchema>;

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  set_company_status: "Akquisestatus des Unternehmens setzen",
  set_contact_status: "Status des Ansprechpartners setzen",
  create_task: "Aufgabe anlegen",
  notify: "Benachrichtigung senden",
  ensure_deal: "Deal anlegen bzw. Phase setzen",
  set_follow_up: "Wiedervorlage setzen",
};

/** Standard-Automatisierungen (werden beim Setup angelegt, können deaktiviert/angepasst werden). */
export const DEFAULT_AUTOMATIONS: { name: string; description: string; trigger: AutomationTrigger; conditions: z.infer<typeof conditionsSchema>; actions: AutomationAction[] }[] = [
  {
    name: "Interessent: Deal & Rückruf",
    description: "Bei positiver Antwort Status „Interessiert“, Deal anlegen und Rückruf-Aufgabe erstellen.",
    trigger: "reply.classified",
    conditions: { categories: ["interested", "meeting_request"] },
    actions: [
      { type: "set_company_status", status: "interested" },
      { type: "set_contact_status", status: "interested" },
      { type: "ensure_deal", stage: "interested" },
      { type: "create_task", title: "Interessenten zurückrufen und Besichtigung vereinbaren", taskType: "call", dueInDays: 1, priority: "high" },
      { type: "notify", title: "Positive Antwort erhalten" },
    ],
  },
  {
    name: "Später melden: Wiedervorlage",
    description: "Bei „Später melden“ Status setzen und Wiedervorlage zum genannten Termin (sonst in 90 Tagen).",
    trigger: "reply.classified",
    conditions: { categories: ["later"] },
    actions: [
      { type: "set_company_status", status: "contact_later" },
      { type: "set_follow_up", days: 90, useSuggestedDate: true },
    ],
  },
  {
    name: "Kein Interesse",
    description: "Bei Absage Status „Nicht interessiert“ setzen.",
    trigger: "reply.classified",
    conditions: { categories: ["not_interested"] },
    actions: [{ type: "set_company_status", status: "not_interested" }],
  },
  {
    name: "Rückfrage beantworten",
    description: "Bei Rückfragen oder falschem Ansprechpartner eine Aufgabe zur Beantwortung anlegen.",
    trigger: "reply.classified",
    conditions: { categories: ["question", "wrong_person"] },
    actions: [{ type: "create_task", title: "Rückfrage beantworten", taskType: "email", dueInDays: 1, priority: "high" }],
  },
  {
    name: "Unzustellbar: Adresse prüfen",
    description: "Bei Hard Bounce eine Recherche-Aufgabe anlegen. (Die Adresse wird automatisch gesperrt.)",
    trigger: "email.bounced",
    conditions: {},
    actions: [{ type: "create_task", title: "Gültige E-Mail-Adresse bzw. Ansprechpartner recherchieren", taskType: "task", dueInDays: 3, priority: "low" }],
  },
  {
    name: "Keine Antwort: Anruf einplanen",
    description: "Nach abgeschlossener Sequenz ohne Antwort Status „Keine Antwort“ und Anruf-Aufgabe.",
    trigger: "campaign.no_response",
    conditions: {},
    actions: [
      { type: "set_company_status", status: "no_response" },
      { type: "create_task", title: "Telefonisch nachfassen", taskType: "call", dueInDays: 2, priority: "normal" },
    ],
  },
  {
    name: "Gewonnen: Status aktualisieren",
    description: "Deal gewonnen → Unternehmen als „Kunde gewonnen“ markieren.",
    trigger: "deal.stage_changed",
    conditions: { toStage: ["won"] },
    actions: [
      { type: "set_company_status", status: "won" },
      { type: "notify", title: "Neuer Reinigungsvertrag gewonnen 🎉" },
    ],
  },
];

export async function ensureDefaultAutomations() {
  const existing = await db.select({ name: schema.automations.name }).from(schema.automations);
  if (existing.length) return 0;
  for (const a of DEFAULT_AUTOMATIONS) {
    await db.insert(schema.automations).values({ ...a, isSystem: true });
  }
  return DEFAULT_AUTOMATIONS.length;
}

function matches(conditions: z.infer<typeof conditionsSchema>, payload: AutomationEventPayload) {
  const d = payload.data ?? {};
  if (conditions.categories?.length && !conditions.categories.includes(String(d.category ?? ""))) return false;
  if (conditions.toStatus?.length && !conditions.toStatus.includes(d.to as AcqStatus)) return false;
  if (conditions.toStage?.length && !conditions.toStage.includes(d.to as DealStageKey)) return false;
  return true;
}

async function executeAction(action: AutomationAction, p: AutomationEventPayload, automationName: string) {
  const companyId = p.companyId ?? null;
  switch (action.type) {
    case "set_company_status":
      if (companyId) await setCompanyStatus(companyId, action.status, null, db, `Automatisierung: ${automationName}`);
      return `Status → ${action.status}`;
    case "set_contact_status":
      if (p.contactId) await db.update(schema.contacts).set({ status: action.status, updatedAt: new Date() }).where(eq(schema.contacts.id, p.contactId));
      return `Kontaktstatus → ${action.status}`;
    case "create_task": {
      const [company] = companyId ? await db.select({ ownerId: schema.companies.ownerId }).from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
      const due = new Date(Date.now() + action.dueInDays * 86400_000);
      due.setHours(10, 0, 0, 0);
      await db
        .insert(schema.tasks)
        .values({
          title: action.title,
          type: action.taskType,
          priority: action.priority,
          dueAt: due,
          companyId,
          contactId: p.contactId ?? null,
          dealId: p.dealId ?? null,
          assigneeId: company?.ownerId ?? null,
          source: "automation",
          sourceKey: `${p.eventKey}:${action.title}`,
          description: typeof p.data?.summary === "string" ? p.data.summary : null,
        })
        .onConflictDoNothing();
      return `Aufgabe „${action.title}“`;
    }
    case "notify": {
      const [company] = companyId ? await db.select({ name: schema.companies.name, ownerId: schema.companies.ownerId }).from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
      await notify({
        userId: company?.ownerId ?? null,
        title: action.title,
        body: company?.name ?? undefined,
        link: p.messageId ? `/postfach?m=${p.messageId}` : companyId ? `/unternehmen/${companyId}` : undefined,
        level: "success",
      });
      return "Benachrichtigung";
    }
    case "ensure_deal": {
      if (!companyId) return "kein Unternehmen";
      const [open] = await db
        .select()
        .from(schema.deals)
        .where(and(eq(schema.deals.companyId, companyId), notInArray(schema.deals.stage, ["won", "lost"])))
        .limit(1);
      const order = DEAL_STAGE_KEYS.indexOf(action.stage);
      if (open) {
        if (DEAL_STAGE_KEYS.indexOf(open.stage) < order)
          await db.update(schema.deals).set({ stage: action.stage, probability: DEAL_STAGES[action.stage].probability, updatedAt: new Date() }).where(eq(schema.deals.id, open.id));
        return "Deal aktualisiert";
      }
      const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
      const [deal] = await db
        .insert(schema.deals)
        .values({
          title: `Unterhaltsreinigung ${company?.name ?? ""}`.trim(),
          companyId,
          contactId: p.contactId ?? null,
          stage: action.stage,
          probability: DEAL_STAGES[action.stage].probability,
          monthlyValue: company?.estimatedMonthlyValue ?? "0",
          ownerId: company?.ownerId ?? null,
        })
        .returning({ id: schema.deals.id });
      await logActivity({ type: "deal", title: "Deal automatisch angelegt", companyId, contactId: p.contactId, dealId: deal.id });
      return "Deal angelegt";
    }
    case "set_follow_up": {
      const suggested = typeof p.data?.followUpDate === "string" ? new Date(p.data.followUpDate) : null;
      const at = action.useSuggestedDate && suggested && !Number.isNaN(suggested.getTime()) && suggested > new Date() ? suggested : new Date(Date.now() + action.days * 86400_000);
      if (companyId) await db.update(schema.companies).set({ nextFollowUpAt: at }).where(eq(schema.companies.id, companyId));
      await db
        .insert(schema.tasks)
        .values({ title: "Wiedervorlage: erneut Kontakt aufnehmen", type: "follow_up", dueAt: at, companyId, contactId: p.contactId ?? null, source: "automation", sourceKey: `${p.eventKey}:followup` })
        .onConflictDoNothing();
      return `Wiedervorlage ${at.toISOString().slice(0, 10)}`;
    }
  }
}

/** Führt alle passenden Automatisierungen für ein Ereignis aus. Idempotent pro (Automatisierung, eventKey). */
export async function runAutomationEvent(p: AutomationEventPayload) {
  const list = await db.select().from(schema.automations).where(and(eq(schema.automations.trigger, p.event), eq(schema.automations.enabled, true)));
  const results: { automation: string; status: string }[] = [];
  for (const a of list) {
    const conditions = conditionsSchema.safeParse(a.conditions);
    if (!conditions.success || !matches(conditions.data, p)) continue;
    const [run] = await db
      .insert(schema.automationRuns)
      .values({ automationId: a.id, eventKey: p.eventKey, status: "running" })
      .onConflictDoNothing()
      .returning();
    if (!run) continue; // bereits ausgeführt
    const done: string[] = [];
    try {
      const actions = z.array(actionSchema).parse(a.actions);
      for (const act of actions) done.push(await executeAction(act, p, a.name));
      await db.update(schema.automationRuns).set({ status: "success", result: { actions: done } }).where(eq(schema.automationRuns.id, run.id));
      await db.update(schema.automations).set({ runCount: sql`${schema.automations.runCount} + 1`, lastRunAt: new Date() }).where(eq(schema.automations.id, a.id));
      results.push({ automation: a.name, status: "success" });
    } catch (err) {
      log.error("Automatisierung fehlgeschlagen", { automation: a.name, err });
      await db
        .update(schema.automationRuns)
        .set({ status: "error", error: err instanceof Error ? err.message : String(err), result: { actions: done } })
        .where(eq(schema.automationRuns.id, run.id));
      results.push({ automation: a.name, status: "error" });
    }
  }
  return results;
}

/** Täglich: Empfänger ohne Antwort nach Ablauf der Frist → Ereignis „campaign.no_response“. */
export async function detectNoResponse(days: number) {
  const rows = await db.execute<{ id: string; contact_id: string; company_id: string | null }>(sql`
    select r.id, r.contact_id, c.company_id
    from campaign_recipients r join contacts c on c.id = r.contact_id
    where r.status = 'completed' and r.last_sent_at < now() - make_interval(days => ${days})
      and not exists (select 1 from email_messages m where m.recipient_id = r.id and m.direction = 'inbound')
      and not exists (select 1 from automation_runs ar where ar.event_key = 'noresp:' || r.id)`);
  return rows.map((r) => ({
    event: "campaign.no_response" as const,
    eventKey: `noresp:${r.id}`,
    contactId: r.contact_id,
    companyId: r.company_id,
  }));
}

