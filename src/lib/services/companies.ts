import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Tx } from "@/db";
import { INDUSTRY_KEYS, ACQ_STATUS_KEYS } from "@/lib/constants";
import { extractDomain, isFreemailDomain, normalizeCompanyName, normalizePhone, normalizeWebsite, similarity, normalizeEmail } from "@/lib/normalize";
import { DECISION_MAKER_PATTERN, scoreCompany } from "@/lib/scoring";
import { logActivity } from "./audit";

type Conn = typeof db | Tx;

const optStr = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const companyInputSchema = z.object({
  name: z.string().trim().min(2, "Firmenname ist erforderlich"),
  industry: z.enum(INDUSTRY_KEYS as [string, ...string[]]).default("other"),
  street: optStr,
  postalCode: optStr.refine((v) => !v || /^\d{5}$/.test(v), "PLZ muss 5-stellig sein"),
  city: optStr,
  district: optStr,
  website: optStr,
  phone: optStr,
  email: optStr.refine((v) => !v || !!normalizeEmail(v), "Ungültige E-Mail-Adresse"),
  companySize: optStr,
  employeeCount: z.coerce.number().int().min(0).optional().nullable(),
  areaSqm: z.coerce.number().int().min(0).optional().nullable(),
  source: z.string().trim().default("manual"),
  sourceRef: optStr,
  notes: optStr,
  status: z.enum(ACQ_STATUS_KEYS as [string, ...string[]]).optional(),
  ownerId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1)).optional(),
  estimatedMonthlyValue: z.coerce.number().min(0).optional().nullable(),
  lat: z.coerce.number().optional().nullable(),
  lon: z.coerce.number().optional().nullable(),
});
export type CompanyInput = z.input<typeof companyInputSchema>;

export type DuplicateMatch = { id: string; name: string; reason: string; score: number; city: string | null; postalCode: string | null };

/** Findet mögliche Duplikate über Quelle, Domain, Telefonnummer und Namensähnlichkeit. */
export async function findCompanyDuplicates(
  input: { name: string; website?: string | null; email?: string | null; phone?: string | null; postalCode?: string | null; source?: string | null; sourceRef?: string | null },
  opts: { excludeId?: string; conn?: Conn } = {},
): Promise<DuplicateMatch[]> {
  const conn = opts.conn ?? db;
  const norm = normalizeCompanyName(input.name);
  let domain = extractDomain(input.website) ?? extractDomain(input.email);
  if (isFreemailDomain(domain)) domain = null;
  const phone = normalizePhone(input.phone);
  const firstToken = norm.split(" ")[0] ?? norm;

  const conds = [
    eq(schema.companies.normalizedName, norm),
    firstToken.length >= 3 ? sql`${schema.companies.normalizedName} like ${firstToken + "%"}` : undefined,
    domain ? eq(schema.companies.domain, domain) : undefined,
    phone ? sql`regexp_replace(coalesce(${schema.companies.phone}, ''), '[^0-9+]', '', 'g') = ${phone}` : undefined,
    input.source && input.sourceRef ? and(eq(schema.companies.source, input.source), eq(schema.companies.sourceRef, input.sourceRef)) : undefined,
  ].filter(Boolean);

  const rows = await conn
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      normalizedName: schema.companies.normalizedName,
      domain: schema.companies.domain,
      phone: schema.companies.phone,
      postalCode: schema.companies.postalCode,
      city: schema.companies.city,
      source: schema.companies.source,
      sourceRef: schema.companies.sourceRef,
    })
    .from(schema.companies)
    .where(and(isNull(schema.companies.mergedIntoId), or(...conds), opts.excludeId ? ne(schema.companies.id, opts.excludeId) : undefined))
    .limit(50);

  const out: DuplicateMatch[] = [];
  for (const r of rows) {
    let score = 0;
    const reasons: string[] = [];
    if (input.source && input.sourceRef && r.source === input.source && r.sourceRef === input.sourceRef) {
      score = 1;
      reasons.push("gleicher Datensatz der Quelle");
    }
    if (domain && r.domain === domain) {
      score = Math.max(score, 0.95);
      reasons.push("gleiche Domain");
    }
    if (phone && normalizePhone(r.phone) === phone) {
      score = Math.max(score, 0.9);
      reasons.push("gleiche Telefonnummer");
    }
    const sim = r.normalizedName === norm ? 1 : similarity(r.normalizedName, norm);
    if (sim >= 0.6) {
      const samePlz = input.postalCode && r.postalCode === input.postalCode;
      const s = sim * (samePlz ? 1 : 0.85);
      if (s >= 0.6) {
        score = Math.max(score, s);
        reasons.push(sim === 1 ? "gleicher Name" : `ähnlicher Name (${Math.round(sim * 100)} %)`);
      }
    }
    if (score >= 0.6) out.push({ id: r.id, name: r.name, reason: reasons.join(", "), score, city: r.city, postalCode: r.postalCode });
  }
  return out.sort((a, b) => b.score - a.score);
}

export async function createCompany(raw: CompanyInput, actorId: string | null, conn: Conn = db) {
  const input = companyInputSchema.parse(raw);
  const website = normalizeWebsite(input.website);
  let domain = extractDomain(website) ?? extractDomain(input.email);
  if (isFreemailDomain(domain)) domain = null;
  const [row] = await conn
    .insert(schema.companies)
    .values({
      name: input.name,
      normalizedName: normalizeCompanyName(input.name),
      industry: input.industry as (typeof INDUSTRY_KEYS)[number],
      street: input.street,
      postalCode: input.postalCode,
      city: input.city ?? "Hamburg",
      district: input.district,
      website,
      domain,
      phone: input.phone,
      email: normalizeEmail(input.email),
      companySize: input.companySize,
      employeeCount: input.employeeCount ?? null,
      areaSqm: input.areaSqm ?? null,
      source: input.source,
      sourceRef: input.sourceRef,
      notes: input.notes,
      status: (input.status as (typeof ACQ_STATUS_KEYS)[number]) ?? "new",
      ownerId: input.ownerId ?? actorId,
      tags: input.tags ?? [],
      estimatedMonthlyValue: input.estimatedMonthlyValue != null ? String(input.estimatedMonthlyValue) : null,
      lat: input.lat != null ? String(input.lat) : null,
      lon: input.lon != null ? String(input.lon) : null,
      lastVerifiedAt: input.source !== "manual" ? new Date() : null,
    })
    .returning();
  await logActivity(
    { type: input.source === "manual" ? "system" : "import", title: `Unternehmen angelegt (${sourceLabel(input.source)})`, companyId: row.id, userId: actorId },
    conn,
  );
  await recalcCompanyScore(row.id, conn);
  return row;
}

export function sourceLabel(source: string) {
  switch (source) {
    case "manual":
      return "manuell";
    case "csv":
      return "CSV-Import";
    case "osm":
      return "OpenStreetMap";
    default:
      return source;
  }
}

export async function updateCompany(id: string, raw: Partial<CompanyInput>, actorId: string | null) {
  const input = companyInputSchema.partial().parse(raw);
  const patch: Partial<typeof schema.companies.$inferInsert> = { updatedAt: new Date() };
  if (input.name) {
    patch.name = input.name;
    patch.normalizedName = normalizeCompanyName(input.name);
  }
  if (input.industry) patch.industry = input.industry as (typeof INDUSTRY_KEYS)[number];
  for (const k of ["street", "postalCode", "city", "district", "phone", "companySize", "notes"] as const) {
    if (k in raw) patch[k] = input[k] ?? null;
  }
  if ("email" in raw) patch.email = normalizeEmail(input.email);
  if ("website" in raw) {
    patch.website = normalizeWebsite(input.website);
    const d = extractDomain(patch.website);
    patch.domain = isFreemailDomain(d) ? null : d;
  }
  if ("employeeCount" in raw) patch.employeeCount = input.employeeCount ?? null;
  if ("areaSqm" in raw) patch.areaSqm = input.areaSqm ?? null;
  if ("ownerId" in raw) patch.ownerId = input.ownerId ?? null;
  if (input.tags) patch.tags = input.tags;
  if ("estimatedMonthlyValue" in raw) patch.estimatedMonthlyValue = input.estimatedMonthlyValue != null ? String(input.estimatedMonthlyValue) : null;
  await db.update(schema.companies).set(patch).where(eq(schema.companies.id, id));
  if (input.status) await setCompanyStatus(id, input.status as (typeof ACQ_STATUS_KEYS)[number], actorId);
  await recalcCompanyScore(id);
}

export async function setCompanyStatus(id: string, status: (typeof ACQ_STATUS_KEYS)[number], actorId: string | null, conn: Conn = db, reason?: string) {
  const [before] = await conn.select({ status: schema.companies.status }).from(schema.companies).where(eq(schema.companies.id, id));
  if (!before || before.status === status) return false;
  await conn.update(schema.companies).set({ status, updatedAt: new Date() }).where(eq(schema.companies.id, id));
  await logActivity(
    {
      type: "status_change",
      title: `Status geändert`,
      body: reason ?? null,
      companyId: id,
      userId: actorId,
      meta: { from: before.status, to: status },
    },
    conn,
  );
  return true;
}

export async function recalcCompanyScore(id: string, conn: Conn = db) {
  const [c] = await conn.select().from(schema.companies).where(eq(schema.companies.id, id));
  if (!c || c.potentialOverride) return;
  const contacts = await conn.select({ position: schema.contacts.position }).from(schema.contacts).where(eq(schema.contacts.companyId, id));
  const [{ n: locations }] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.companyLocations)
    .where(eq(schema.companyLocations.companyId, id));
  const { score } = scoreCompany({
    industry: c.industry,
    employeeCount: c.employeeCount,
    areaSqm: c.areaSqm,
    companySize: c.companySize,
    hasWebsite: !!c.website,
    hasPhone: !!c.phone,
    contactCount: contacts.length,
    hasDecisionMaker: contacts.some((x) => x.position && DECISION_MAKER_PATTERN.test(x.position)),
    locationCount: locations + 1,
    city: c.city,
  });
  await conn.update(schema.companies).set({ potentialScore: score }).where(eq(schema.companies.id, id));
}

/**
 * Führt `sourceIds` in `targetId` zusammen: Kontakte, Aktivitäten, Deals, Aufgaben, Angebote,
 * Verträge, E-Mails und Standorte werden umgehängt; leere Felder des Ziels werden ergänzt.
 */
export async function mergeCompanies(targetId: string, sourceIds: string[], actorId: string | null) {
  const ids = sourceIds.filter((s) => s !== targetId);
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(schema.companies).where(eq(schema.companies.id, targetId));
    if (!target) throw new Error("Zielunternehmen nicht gefunden");
    const sources = await tx.select().from(schema.companies).where(inArray(schema.companies.id, ids));
    const fill: Partial<typeof schema.companies.$inferInsert> = {};
    for (const s of sources) {
      for (const k of ["street", "postalCode", "district", "website", "domain", "phone", "email", "companySize", "employeeCount", "areaSqm"] as const) {
        if (target[k] == null && s[k] != null && fill[k] == null) (fill as Record<string, unknown>)[k] = s[k];
      }
    }
    const tags = [...new Set([...target.tags, ...sources.flatMap((s) => s.tags)])];
    const notes = [target.notes, ...sources.map((s) => s.notes && `[aus ${s.name}] ${s.notes}`)].filter(Boolean).join("\n\n") || null;
    await tx.update(schema.companies).set({ ...fill, tags, notes, updatedAt: new Date() }).where(eq(schema.companies.id, targetId));

    for (const t of [schema.contacts, schema.activities, schema.deals, schema.tasks, schema.appointments, schema.offers, schema.contracts, schema.emailMessages, schema.companyLocations] as const) {
      await tx.update(t).set({ companyId: targetId } as never).where(inArray(t.companyId, ids));
    }
    // Quellen als Standorte übernehmen, falls Adresse abweicht
    for (const s of sources) {
      if (s.street && s.street !== target.street) {
        await tx.insert(schema.companyLocations).values({ companyId: targetId, label: s.name, street: s.street, postalCode: s.postalCode, city: s.city, district: s.district });
      }
    }
    await tx.update(schema.companies).set({ mergedIntoId: targetId, updatedAt: new Date() }).where(inArray(schema.companies.id, ids));
    await logActivity(
      { type: "merge", title: `${sources.length} Unternehmen zusammengeführt`, body: sources.map((s) => s.name).join(", "), companyId: targetId, userId: actorId },
      tx,
    );
  });
  await recalcCompanyScore(targetId);
}
