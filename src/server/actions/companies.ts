"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ACQ_STATUS_KEYS, type AcqStatus } from "@/lib/constants";
import { parseCompanyCsv } from "@/lib/finder/csv";
import { logActivity } from "@/lib/services/audit";
import { createCompany, findCompanyDuplicates, mergeCompanies, recalcCompanyScore, setCompanyStatus, updateCompany, type CompanyInput } from "@/lib/services/companies";
import { importCsvRows } from "@/lib/services/import";
import { run } from "@/server/action";

function revalidate(id?: string) {
  revalidatePath("/unternehmen");
  if (id) revalidatePath(`/unternehmen/${id}`);
  revalidatePath("/dashboard");
}

export async function createCompanyAction(input: CompanyInput, force = false) {
  const me = await requireUser();
  return run(async () => {
    if (!force) {
      const dupes = await findCompanyDuplicates({ name: input.name, website: input.website, email: input.email, phone: input.phone, postalCode: input.postalCode });
      if (dupes.length) return { duplicates: dupes, id: null as string | null };
    }
    const c = await createCompany(input, me.id);
    revalidate();
    return { duplicates: [], id: c.id as string | null };
  });
}

export async function updateCompanyAction(id: string, input: Partial<CompanyInput>) {
  const me = await requireUser();
  return run(async () => {
    await updateCompany(id, input, me.id);
    revalidate(id);
  }, "Gespeichert");
}

export async function setPotentialAction(id: string, score: number | null) {
  await requireUser();
  return run(async () => {
    if (score === null) {
      await db.update(schema.companies).set({ potentialOverride: false }).where(eq(schema.companies.id, id));
      await recalcCompanyScore(id);
    } else {
      await db
        .update(schema.companies)
        .set({ potentialScore: Math.max(0, Math.min(100, Math.round(score))), potentialOverride: true })
        .where(eq(schema.companies.id, id));
    }
    revalidate(id);
  });
}

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(ACQ_STATUS_KEYS as [AcqStatus, ...AcqStatus[]]).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  addTag: z.string().trim().min(1).optional(),
  removeTag: z.string().trim().min(1).optional(),
});

export async function bulkUpdateCompaniesAction(raw: z.input<typeof bulkSchema>) {
  const me = await requireUser();
  return run(async () => {
    const input = bulkSchema.parse(raw);
    if (input.status) for (const id of input.ids) await setCompanyStatus(id, input.status, me.id);
    if (input.ownerId !== undefined) await db.update(schema.companies).set({ ownerId: input.ownerId }).where(inArray(schema.companies.id, input.ids));
    if (input.addTag)
      await db
        .update(schema.companies)
        .set({ tags: sql`array(select distinct unnest(${schema.companies.tags} || array[${input.addTag}]::text[]))` })
        .where(inArray(schema.companies.id, input.ids));
    if (input.removeTag)
      await db.update(schema.companies).set({ tags: sql`array_remove(${schema.companies.tags}, ${input.removeTag})` }).where(inArray(schema.companies.id, input.ids));
    revalidate();
    return input.ids.length;
  }, "Aktualisiert");
}

export async function deleteCompaniesAction(ids: string[]) {
  const me = await requireUser();
  return run(async () => {
    await db.delete(schema.companies).where(inArray(schema.companies.id, ids));
    await db.insert(schema.auditLog).values({ actorId: me.id, action: "delete", entity: "company", details: { ids } });
    revalidate();
  }, "Gelöscht");
}

export async function mergeCompaniesAction(targetId: string, sourceIds: string[]) {
  const me = await requireUser();
  return run(async () => {
    await mergeCompanies(targetId, sourceIds, me.id);
    revalidate(targetId);
  }, "Zusammengeführt");
}

export async function addNoteAction(input: { companyId?: string | null; contactId?: string | null; dealId?: string | null; type: "note" | "call" | "meeting"; title?: string; body: string }) {
  const me = await requireUser();
  return run(async () => {
    const body = z.string().trim().min(1, "Notiz ist leer").max(10000).parse(input.body);
    const titles = { note: "Notiz", call: "Telefonat", meeting: "Gespräch vor Ort" };
    await logActivity({ type: input.type, title: input.title?.trim() || titles[input.type], body, companyId: input.companyId ?? null, contactId: input.contactId ?? null, dealId: input.dealId ?? null, userId: me.id });
    if (input.companyId) revalidate(input.companyId);
    if (input.contactId) revalidatePath(`/ansprechpartner/${input.contactId}`);
  }, "Gespeichert");
}

export async function setFollowUpAction(companyId: string, at: string | null, note?: string) {
  const me = await requireUser();
  return run(async () => {
    const date = at ? new Date(at) : null;
    await db.update(schema.companies).set({ nextFollowUpAt: date }).where(eq(schema.companies.id, companyId));
    if (date) {
      await db.insert(schema.tasks).values({ title: note?.trim() || "Wiedervorlage", type: "follow_up", dueAt: date, companyId, assigneeId: me.id, createdById: me.id });
    }
    revalidate(companyId);
    revalidatePath("/aufgaben");
  }, "Wiedervorlage gesetzt");
}

export async function addLocationAction(companyId: string, input: { label: string; street?: string; postalCode?: string; city?: string; district?: string; headcount?: number | null }) {
  await requireUser();
  return run(async () => {
    const v = z
      .object({ label: z.string().trim().min(1, "Bezeichnung fehlt"), street: z.string().trim().optional(), postalCode: z.string().trim().optional(), city: z.string().trim().optional(), district: z.string().trim().optional(), headcount: z.coerce.number().int().min(0).nullable().optional() })
      .parse(input);
    await db.insert(schema.companyLocations).values({ companyId, ...v, city: v.city || "Hamburg", headcount: v.headcount ?? null });
    await recalcCompanyScore(companyId);
    revalidate(companyId);
  }, "Standort hinzugefügt");
}

export async function deleteLocationAction(id: string, companyId: string) {
  await requireUser();
  return run(async () => {
    await db.delete(schema.companyLocations).where(and(eq(schema.companyLocations.id, id), eq(schema.companyLocations.companyId, companyId)));
    await recalcCompanyScore(companyId);
    revalidate(companyId);
  });
}

export async function previewCsvAction(text: string) {
  await requireUser();
  return run(async () => {
    if (text.length > 5_000_000) throw new Error("Datei ist zu groß (max. 5 MB).");
    const r = parseCompanyCsv(text);
    return { count: r.rows.length, errors: r.errors.slice(0, 50), mappedColumns: r.mappedColumns, sample: r.rows.slice(0, 5).map((x) => ({ name: x.name, industry: x.industry, postalCode: x.postalCode, contact: x.contact?.email ?? null, consent: !!x.consent })) };
  });
}

export async function importCsvAction(text: string, tag?: string) {
  const me = await requireUser();
  return run(async () => {
    const r = parseCompanyCsv(text);
    const summary = await importCsvRows(r.rows, me.id, { tag: tag?.trim() || undefined });
    revalidate();
    revalidatePath("/ansprechpartner");
    return { ...summary, errors: [...r.errors, ...summary.errors].slice(0, 100) };
  });
}

export async function findDuplicateGroupsAction() {
  await requireUser();
  return run(async () => {
    const rows = await db.execute<{ ids: string[]; names: string[]; reason: string }>(sql`
      select array_agg(id order by created_at) as ids, array_agg(name order by created_at) as names, 'gleicher Name' as reason
      from companies where merged_into_id is null group by normalized_name having count(*) > 1
      union all
      select array_agg(id order by created_at), array_agg(name order by created_at), 'gleiche Domain'
      from companies where merged_into_id is null and domain is not null group by domain having count(*) > 1
      limit 100`);
    return rows.map((r) => ({ ids: r.ids, names: r.names, reason: r.reason }));
  });
}
