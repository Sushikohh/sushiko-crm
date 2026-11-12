import type { IndustryKey } from "@/lib/constants";
import { env } from "@/lib/env";

/**
 * OpenStreetMap über die Overpass API.
 * Lizenz: ODbL 1.0 – Namensnennung „© OpenStreetMap-Mitwirkende“ erforderlich.
 * Nutzung gemäß Overpass-Nutzungsrichtlinien: identifizierender User-Agent, moderate Abfragen, Timeout.
 */
export type FinderResult = {
  source: "osm";
  sourceRef: string;
  name: string;
  industry: IndustryKey;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lon: number | null;
  tags: Record<string, string>;
};

export type FinderQuery = {
  industry?: IndustryKey | "all";
  name?: string;
  quarter?: string;
  postalCode?: string;
  limit?: number;
};

const T = (key: string, re: string) => `["${key}"~"^(${re})$"]`;

/** Zuordnung Zielbranche → OSM-Tags. */
export const OSM_FILTERS: Record<IndustryKey, string[]> = {
  office: [T("office", "company|insurance|financial|it|telecommunication|energy_supplier|logistics")],
  agency: [T("office", "advertising_agency|marketing|graphic_design|newspaper|media|publisher|consulting_agency")],
  event_agency: [T("office", "event_management|event_agency"), T("amenity", "events_venue|conference_centre|exhibition_centre")],
  consulting: [T("office", "lawyer|notary|tax_advisor|accountant|consulting|financial_advisor|architect|engineer")],
  tech: [T("office", "it|software|startup|research|engineering")],
  coworking: [T("amenity", "coworking_space"), T("office", "coworking")],
  hotel: [T("tourism", "hotel|guest_house"), T("amenity", "conference_centre")],
  medical: [T("amenity", "doctors|dentist|clinic|hospital"), T("healthcare", "doctor|dentist|clinic|centre")],
  education: [T("amenity", "university|college|language_school|training"), T("office", "educational_institution")],
  fitness: [T("leisure", "fitness_centre"), T("amenity", "spa"), `["leisure"="sports_centre"]["sport"~"fitness|yoga"]`],
  retail: [T("shop", "department_store|clothes|furniture|jewelry|car|interior_decoration|cosmetics|boutique")],
  other: [T("office", "association|ngo|foundation|government|diplomatic")],
};

const escapeRe = (s: string) => s.replace(/["\\]/g, "").replace(/[.*+?^${}()|[\]]/g, "\\$&");

export function buildOverpassQuery(q: FinderQuery): string {
  const limit = Math.min(Math.max(q.limit ?? 150, 1), 400);
  const industries: IndustryKey[] = !q.industry || q.industry === "all" ? (Object.keys(OSM_FILTERS) as IndustryKey[]) : [q.industry];
  const nameFilter = q.name?.trim() ? `["name"~"${escapeRe(q.name.trim())}",i]` : `["name"]`;
  const lines: string[] = ['[out:json][timeout:30];', 'area["ISO3166-2"="DE-HH"]["admin_level"="4"]->.hh;'];
  let areaFilter = "(area.hh)";
  if (q.postalCode && /^\d{5}$/.test(q.postalCode)) {
    lines.push(`area["boundary"="postal_code"]["postal_code"="${q.postalCode}"]->.q;`);
    areaFilter = "(area.q)";
  } else if (q.quarter?.trim()) {
    lines.push(`area["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"="${q.quarter.trim().replace(/"/g, "")}"]->.q;`);
    areaFilter = "(area.q)(area.hh)";
  }
  lines.push("(");
  for (const ind of industries) for (const f of OSM_FILTERS[ind]) lines.push(`  nwr${f}${nameFilter}${areaFilter};`);
  lines.push(");");
  lines.push(`out center tags ${limit};`);
  return lines.join("\n");
}

type OverpassElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export function industryFromTags(tags: Record<string, string>, fallback: IndustryKey): IndustryKey {
  for (const [ind, filters] of Object.entries(OSM_FILTERS) as [IndustryKey, string[]][]) {
    for (const f of filters) {
      const m = f.match(/^\["([^"]+)"~"\^\(([^)]+)\)\$"\]$/);
      if (m && tags[m[1]] && new RegExp(`^(${m[2]})$`).test(tags[m[1]])) return ind;
    }
  }
  if (tags.leisure === "sports_centre") return "fitness";
  if (tags.office) return "office";
  return fallback;
}

export function mapOverpassElements(elements: OverpassElement[], requested: IndustryKey | "all" | undefined): FinderResult[] {
  const out: FinderResult[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!t.name) continue;
    const ref = `${el.type}/${el.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || null;
    out.push({
      source: "osm",
      sourceRef: ref,
      name: t.name,
      industry: industryFromTags(t, requested && requested !== "all" ? requested : "other"),
      street,
      postalCode: t["addr:postcode"] ?? null,
      city: t["addr:city"] ?? "Hamburg",
      district: t["addr:suburb"] ?? t["addr:district"] ?? null,
      website: t.website ?? t["contact:website"] ?? t.url ?? null,
      phone: t.phone ?? t["contact:phone"] ?? null,
      email: t.email ?? t["contact:email"] ?? null,
      lat: el.lat ?? el.center?.lat ?? null,
      lon: el.lon ?? el.center?.lon ?? null,
      tags: t,
    });
  }
  return out;
}

export function osmEnabled() {
  return !!env.FINDER_OSM_ENABLED;
}

export async function searchOsm(q: FinderQuery): Promise<FinderResult[]> {
  if (!osmEnabled()) throw new Error("Datenquelle OpenStreetMap ist nicht aktiviert (FINDER_OSM_ENABLED=true).");
  const query = buildOverpassQuery(q);
  const ua = `SushikoCRM/1.0 (${env.FINDER_CONTACT_EMAIL ?? env.APP_URL})`;
  const res = await fetch(env.FINDER_OVERPASS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": ua, accept: "application/json" },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 429) throw new Error("Overpass-Limit erreicht – bitte in einer Minute erneut versuchen.");
  if (!res.ok) throw new Error(`Overpass-Fehler ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
  if (data.remark && /timed out|runtime error/i.test(data.remark)) throw new Error(`Overpass: ${data.remark}`);
  return mapOverpassElements(data.elements ?? [], q.industry);
}
