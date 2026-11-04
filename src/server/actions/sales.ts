"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { OfferItem } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { DEAL_STAGE_KEYS, DEAL_STAGES, type DealStageKey } from "@/lib/constants";
import { enqueue, QUEUES } from "@/lib/queue";
import { logActivity } from "@/lib/services/audit";
import { setCompanyStatus } from "@/lib/services/companies";
import { getSetting } from "@/lib/services/settings";
import { run } from "@/server/action";

const uuidOpt = z.string().uuid().optional().nullable().or(z.literal("").transform(() => null));
const money = z.coerce.number().min(0).max(10_000_000);

function rp(companyId?: string | null) {
  revalidatePath("/pipeline");
  revalidatePath("/aufgaben");
  revalidatePath("/angebote");
  revalidatePath("/dashboard");
  if (companyId) revalidatePath(`/unternehmen/${companyId}`);
}

/* ---------------- Deals ---------------- */

const dealSchema = z.object({
  title: z.string().trim().min(2, "Titel fehlt"),
  companyId: z.string().uuid("Unternehmen wählen"),
  contactId: uuidOpt,
  stage: z.enum(DEAL_STAGE_KEYS as [DealStageKey, ...DealStageKey[]]).default("lead"),
  monthlyValue: money.default(0),
  expectedCloseDate: z.string().optional().nullable(),
  ownerId: uuidOpt,
});

export async function saveDealAction(id: string | null, raw: z.input<typeof dealSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = dealSchema.parse(raw);
    const values = {
      title: v.title,
      companyId: v.companyId,
      contactId: v.contactId ?? null,
      stage: v.stage,
      monthlyValue: String(v.monthlyValue),
      probability: DEAL_STAGES[v.stage].probability,
      expectedCloseDate: v.expectedCloseDate || null,
      ownerId: v.ownerId ?? me.id,
      updatedAt: new Date(),
    };
    if (id) {
      const [before] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
      await db.update(schema.deals).set(values).where(eq(schema.deals.id, id));
      if (before && before.stage !== v.stage) await afterStageChange(id, before.stage, v.stage, me.id);
    } else {
      const [d] = await db.insert(schema.deals).values(values).returning({ id: schema.deals.id });
      await logActivity({ type: "deal", title: `Deal angelegt: ${v.title}`, companyId: v.companyId, contactId: v.contactId ?? null, dealId: d.id, userId: me.id });
      id = d.id;
    }
    rp(v.companyId);
    return id;
  }, "Deal gespeichert");
}

const STAGE_TO_STATUS: Partial<Record<DealStageKey, Parameters<typeof setCompanyStatus>[1]>> = {
  contacted: "contacted",
  interested: "interested",
  visit_scheduled: "visit_scheduled",
  offer_sent: "offer_created",
  negotiation: "negotiation",
  won: "won",
  lost: "lost",
};

async function afterStageChange(dealId: string, from: DealStageKey, to: DealStageKey, actorId: string) {
  const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!d) return;
  if (to === "won" || to === "lost") await db.update(schema.deals).set({ closedAt: new Date() }).where(eq(schema.deals.id, dealId));
  const status = STAGE_TO_STATUS[to];
  if (status) await setCompanyStatus(d.companyId, status, actorId, db, `Deal „${d.title}“ → ${DEAL_STAGES[to].label}`);
  await logActivity({ type: "deal", title: `Deal-Phase: ${DEAL_STAGES[from].label} → ${DEAL_STAGES[to].label}`, companyId: d.companyId, dealId, userId: actorId });
  await enqueue(QUEUES.automationEvent, {
    event: "deal.stage_changed",
    eventKey: `deal:${dealId}:${to}:${Date.now()}`,
    companyId: d.companyId,
    contactId: d.contactId,
    dealId,
    data: { from, to },
  }).catch(() => undefined);
}

export async function moveDealAction(id: string, stage: DealStageKey, lostReason?: string) {
  const me = await requireUser();
  return run(async () => {
    const [before] = await db.select().from(schema.deals).where(eq(schema.deals.id, id));
    if (!before) throw new Error("Deal nicht gefunden");
    if (before.stage === stage) return;
    await db
      .update(schema.deals)
      .set({ stage, probability: DEAL_STAGES[stage].probability, lostReason: stage === "lost" ? (lostReason ?? before.lostReason) : null, updatedAt: new Date() })
      .where(eq(schema.deals.id, id));
    await afterStageChange(id, before.stage, stage, me.id);
    rp(before.companyId);
  });
}

export async function deleteDealAction(id: string) {
  await requireUser();
  return run(async () => {
    const [d] = await db.delete(schema.deals).where(eq(schema.deals.id, id)).returning();
    rp(d?.companyId);
  }, "Deal gelöscht");
}

/* ---------------- Aufgaben ---------------- */

const taskSchema = z.object({
  title: z.string().trim().min(2, "Titel fehlt"),
  description: z.string().trim().optional().nullable(),
  type: z.enum(["task", "call", "follow_up", "email", "site_visit"]).default("task"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueAt: z.string().optional().nullable(),
  companyId: uuidOpt,
  contactId: uuidOpt,
  dealId: uuidOpt,
  assigneeId: uuidOpt,
});

export async function saveTaskAction(id: string | null, raw: z.input<typeof taskSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = taskSchema.parse(raw);
    const values = {
      title: v.title,
      description: v.description ?? null,
      type: v.type,
      priority: v.priority,
      dueAt: v.dueAt ? new Date(v.dueAt) : null,
      companyId: v.companyId ?? null,
      contactId: v.contactId ?? null,
      dealId: v.dealId ?? null,
      assigneeId: v.assigneeId ?? me.id,
    };
    if (id) await db.update(schema.tasks).set(values).where(eq(schema.tasks.id, id));
    else await db.insert(schema.tasks).values({ ...values, createdById: me.id });
    rp(v.companyId);
  }, "Aufgabe gespeichert");
}

export async function toggleTaskAction(id: string, done: boolean) {
  const me = await requireUser();
  return run(async () => {
    const [t] = await db.update(schema.tasks).set({ completedAt: done ? new Date() : null }).where(eq(schema.tasks.id, id)).returning();
    if (t && done) await logActivity({ type: "task", title: `Aufgabe erledigt: ${t.title}`, companyId: t.companyId, contactId: t.contactId, dealId: t.dealId, userId: me.id });
    rp(t?.companyId);
  });
}

export async function deleteTaskAction(id: string) {
  await requireUser();
  return run(async () => {
    const [t] = await db.delete(schema.tasks).where(eq(schema.tasks.id, id)).returning();
    rp(t?.companyId);
  });
}

/* ---------------- Termine / Besichtigungen ---------------- */

const apptSchema = z.object({
  title: z.string().trim().min(2, "Titel fehlt"),
  type: z.string().default("site_visit"),
  startsAt: z.string().min(1, "Beginn fehlt"),
  endsAt: z.string().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  companyId: uuidOpt,
  contactId: uuidOpt,
  dealId: uuidOpt,
  ownerId: uuidOpt,
});

export async function saveAppointmentAction(id: string | null, raw: z.input<typeof apptSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = apptSchema.parse(raw);
    const startsAt = new Date(v.startsAt);
    const values = {
      title: v.title,
      type: v.type,
      startsAt,
      endsAt: v.endsAt ? new Date(v.endsAt) : new Date(startsAt.getTime() + 60 * 60_000),
      location: v.location ?? null,
      notes: v.notes ?? null,
      companyId: v.companyId ?? null,
      contactId: v.contactId ?? null,
      dealId: v.dealId ?? null,
      ownerId: v.ownerId ?? me.id,
    };
    if (id) await db.update(schema.appointments).set(values).where(eq(schema.appointments.id, id));
    else {
      await db.insert(schema.appointments).values(values);
      await logActivity({ type: "meeting", title: `Termin geplant: ${v.title}`, body: `${startsAt.toLocaleString("de-DE")}${v.location ? ` · ${v.location}` : ""}`, companyId: values.companyId, contactId: values.contactId, dealId: values.dealId, userId: me.id });
      if (values.companyId && v.type === "site_visit") {
        await setCompanyStatus(values.companyId, "visit_scheduled", me.id);
        const [open] = await db.select().from(schema.deals).where(and(eq(schema.deals.companyId, values.companyId), sql`${schema.deals.stage} in ('lead','contacted','interested')`)).limit(1);
        if (open) await db.update(schema.deals).set({ stage: "visit_scheduled", probability: DEAL_STAGES.visit_scheduled.probability }).where(eq(schema.deals.id, open.id));
      }
    }
    rp(values.companyId);
  }, "Termin gespeichert");
}

export async function setAppointmentStatusAction(id: string, status: "planned" | "done" | "cancelled" | "no_show", outcome?: string) {
  const me = await requireUser();
  return run(async () => {
    const [a] = await db.update(schema.appointments).set({ status, outcome: outcome ?? null }).where(eq(schema.appointments.id, id)).returning();
    if (a && status === "done") await logActivity({ type: "meeting", title: `Termin durchgeführt: ${a.title}`, body: outcome ?? null, companyId: a.companyId, contactId: a.contactId, dealId: a.dealId, userId: me.id });
    rp(a?.companyId);
  });
}

/* ---------------- Angebote ---------------- */

const itemSchema = z.object({
  description: z.string().trim().min(1, "Leistung fehlt"),
  areaSqm: z.coerce.number().min(0).nullable().optional(),
  frequency: z.string().trim().default(""),
  unit: z.enum(["monthly", "one_time"]),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
});

const offerSchema = z.object({
  title: z.string().trim().min(2, "Titel fehlt"),
  companyId: z.string().uuid("Unternehmen wählen"),
  contactId: uuidOpt,
  dealId: uuidOpt,
  items: z.array(itemSchema).min(1, "Mindestens eine Position"),
  vatRate: z.coerce.number().min(0).max(30).default(19),
  validUntil: z.string().optional().nullable(),
  introText: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
});

export async function saveOfferAction(id: string | null, raw: z.input<typeof offerSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = offerSchema.parse(raw);
    const items: OfferItem[] = v.items.map((i) => ({ ...i, areaSqm: i.areaSqm ?? null }));
    const monthly = items.filter((i) => i.unit === "monthly").reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const oneTime = items.filter((i) => i.unit === "one_time").reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const values = {
      title: v.title,
      companyId: v.companyId,
      contactId: v.contactId ?? null,
      dealId: v.dealId ?? null,
      items,
      monthlyNet: monthly.toFixed(2),
      oneTimeNet: oneTime.toFixed(2),
      vatRate: String(v.vatRate),
      validUntil: v.validUntil || null,
      introText: v.introText ?? null,
      terms: v.terms ?? null,
      updatedAt: new Date(),
    };
    if (id) {
      await db.update(schema.offers).set(values).where(eq(schema.offers.id, id));
    } else {
      const sales = await getSetting("sales");
      const [{ n }] = await db.execute<{ n: string }>(sql`select nextval('offer_number_seq')::text as n`);
      const number = `${sales?.offerPrefix ?? "ANG"}-${new Date().getFullYear()}-${n}`;
      const [o] = await db.insert(schema.offers).values({ ...values, number, ownerId: me.id }).returning({ id: schema.offers.id });
      id = o.id;
      await logActivity({ type: "offer", title: `Angebot erstellt: ${number}`, companyId: v.companyId, contactId: values.contactId, dealId: values.dealId, userId: me.id });
      await setCompanyStatus(v.companyId, "offer_created", me.id);
    }
    if (values.dealId) await db.update(schema.deals).set({ monthlyValue: values.monthlyNet }).where(eq(schema.deals.id, values.dealId));
    rp(v.companyId);
    return id;
  }, "Angebot gespeichert");
}

export async function setOfferStatusAction(id: string, status: "draft" | "sent" | "accepted" | "rejected" | "expired", contract?: { startDate: string; noticePeriodMonths?: number }) {
  const me = await requireUser();
  return run(async () => {
    const [o] = await db.select().from(schema.offers).where(eq(schema.offers.id, id));
    if (!o) throw new Error("Angebot nicht gefunden");
    const now = new Date();
    await db
      .update(schema.offers)
      .set({ status, sentAt: status === "sent" ? (o.sentAt ?? now) : o.sentAt, decidedAt: status === "accepted" || status === "rejected" ? now : o.decidedAt, updatedAt: now })
      .where(eq(schema.offers.id, id));
    await logActivity({ type: "offer", title: `Angebot ${o.number}: ${status}`, companyId: o.companyId, dealId: o.dealId, userId: me.id });
    const moveDeal = async (stage: DealStageKey) => {
      if (!o.dealId) return;
      const [d] = await db.select().from(schema.deals).where(eq(schema.deals.id, o.dealId));
      if (d && d.stage !== stage) {
        await db.update(schema.deals).set({ stage, probability: DEAL_STAGES[stage].probability, updatedAt: now }).where(eq(schema.deals.id, d.id));
        await afterStageChange(d.id, d.stage, stage, me.id);
      }
    };
    if (status === "sent") await moveDeal("offer_sent");
    if (status === "rejected") await moveDeal("lost");
    if (status === "accepted") {
      const startDate = contract?.startDate || now.toISOString().slice(0, 10);
      const items = (o.items ?? []) as OfferItem[];
      const [k] = await db
        .insert(schema.contracts)
        .values({
          title: o.title,
          companyId: o.companyId,
          offerId: o.id,
          dealId: o.dealId,
          monthlyValue: o.monthlyNet,
          startDate,
          noticePeriodMonths: contract?.noticePeriodMonths ?? 3,
          serviceScope: items.map((i) => `${i.description}${i.frequency ? ` (${i.frequency})` : ""}`).join("\n"),
          signedAt: now,
          ownerId: o.ownerId ?? me.id,
        })
        .returning({ id: schema.contracts.id });
      await logActivity({ type: "contract", title: `Vertrag abgeschlossen: ${o.title}`, body: `${Number(o.monthlyNet).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} / Monat`, companyId: o.companyId, dealId: o.dealId, userId: me.id, meta: { contractId: k.id } });
      await moveDeal("won");
      await setCompanyStatus(o.companyId, "won", me.id);
      await enqueue(QUEUES.automationEvent, { event: "offer.accepted", eventKey: `offer:${o.id}:accepted`, companyId: o.companyId, dealId: o.dealId, data: { offerId: o.id } }).catch(() => undefined);
    }
    rp(o.companyId);
  }, "Status aktualisiert");
}

/* ---------------- Verträge ---------------- */

const contractSchema = z.object({
  title: z.string().trim().min(2),
  companyId: z.string().uuid(),
  monthlyValue: money,
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  noticePeriodMonths: z.coerce.number().int().min(0).max(36).default(3),
  serviceScope: z.string().optional().nullable(),
  status: z.enum(["active", "paused", "terminated", "ended"]).default("active"),
});

export async function saveContractAction(id: string | null, raw: z.input<typeof contractSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = contractSchema.parse(raw);
    const values = { ...v, monthlyValue: String(v.monthlyValue), endDate: v.endDate || null, serviceScope: v.serviceScope ?? null };
    if (id) await db.update(schema.contracts).set(values).where(eq(schema.contracts.id, id));
    else {
      await db.insert(schema.contracts).values({ ...values, signedAt: new Date(), ownerId: me.id });
      await logActivity({ type: "contract", title: `Vertrag erfasst: ${v.title}`, companyId: v.companyId, userId: me.id });
      await setCompanyStatus(v.companyId, "won", me.id);
    }
    rp(v.companyId);
  }, "Vertrag gespeichert");
}
