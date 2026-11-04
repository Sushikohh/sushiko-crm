"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { INDUSTRY_KEYS, type IndustryKey } from "@/lib/constants";
import { searchOsm, type FinderResult } from "@/lib/finder/osm";
import { normalizeCompanyName } from "@/lib/normalize";
import { importFinderResult } from "@/lib/services/import";
import { run } from "@/server/action";

const querySchema = z.object({
  industry: z.enum(["all", ...INDUSTRY_KEYS] as [string, ...string[]]).default("all"),
  name: z.string().trim().max(80).optional(),
  quarter: z.string().trim().max(60).optional(),
  postalCode: z.string().trim().regex(/^(\d{5})?$/, "PLZ muss 5-stellig sein").optional(),
  limit: z.coerce.number().int().min(10).max(400).default(150),
});

export type FinderHit = FinderResult & { existingId: string | null; existingReason: string | null };

export async function searchFinderAction(raw: z.input<typeof querySchema>) {
  await requireUser();
  return run(async (): Promise<FinderHit[]> => {
    const q = querySchema.parse(raw);
    if (q.industry === "all" && !q.name && !q.quarter && !q.postalCode) throw new Error("Bitte mindestens Branche, Name, Stadtteil oder PLZ angeben.");
    const results = await searchOsm({ industry: q.industry as IndustryKey | "all", name: q.name, quarter: q.quarter, postalCode: q.postalCode || undefined, limit: q.limit });
    // Vorhandene Datensätze erkennen: gleiche Quell-ID oder gleicher normalisierter Name
    const refs = results.map((r) => r.sourceRef);
    const names = [...new Set(results.map((r) => normalizeCompanyName(r.name)))];
    const [byRef, byName] = await Promise.all([
      refs.length ? db.select({ id: schema.companies.id, ref: schema.companies.sourceRef }).from(schema.companies).where(and(eq(schema.companies.source, "osm"), inArray(schema.companies.sourceRef, refs))) : [],
      names.length
        ? db
            .select({ id: schema.companies.id, n: schema.companies.normalizedName, plz: schema.companies.postalCode })
            .from(schema.companies)
            .where(and(inArray(schema.companies.normalizedName, names), isNull(schema.companies.mergedIntoId)))
        : [],
    ]);
    const refMap = new Map(byRef.map((r) => [r.ref, r.id]));
    return results.map((r) => {
      const byRefId = refMap.get(r.sourceRef);
      if (byRefId) return { ...r, existingId: byRefId, existingReason: "bereits importiert" };
      const n = normalizeCompanyName(r.name);
      const m = byName.find((x) => x.n === n && (!r.postalCode || !x.plz || x.plz === r.postalCode));
      return { ...r, existingId: m?.id ?? null, existingReason: m ? "gleicher Name vorhanden" : null };
    });
  });
}

export async function importFinderAction(items: FinderResult[]) {
  const me = await requireUser();
  return run(async () => {
    if (items.length > 400) throw new Error("Maximal 400 Datensätze pro Import.");
    let created = 0;
    let duplicates = 0;
    const ids: string[] = [];
    for (const it of items) {
      const r = await importFinderResult({ ...it, source: "osm" }, me.id);
      if (r.status === "created") created++;
      else duplicates++;
      ids.push(r.id);
    }
    revalidatePath("/unternehmen");
    revalidatePath("/dashboard");
    return { created, duplicates, ids };
  });
}
