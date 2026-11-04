import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { INDUSTRIES, DEAL_STAGES, type IndustryKey, type DealStageKey } from "@/lib/constants";

/** Globale Suche (Volltext + Teilwort) über Unternehmen, Ansprechpartner und Deals. */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const [companies, contacts, deals] = await Promise.all([
    db.execute<{ id: string; name: string; industry: string; district: string | null; city: string | null }>(sql`
      select id, name, industry, district, city from companies
      where merged_into_id is null and (company_fts(name, street, district, postal_code, notes, tags) @@ websearch_to_tsquery('german', ${q}) or name ilike ${like} or postal_code = ${q} or domain ilike ${like})
      order by (name ilike ${q + "%"}) desc, potential_score desc limit 8`),
    db.execute<{ id: string; first_name: string; last_name: string; email: string | null; company: string | null }>(sql`
      select c.id, c.first_name, c.last_name, c.email, co.name as company from contacts c left join companies co on co.id = c.company_id
      where contact_fts(c.first_name, c.last_name, c.email, c.position, c.notes) @@ websearch_to_tsquery('german', ${q})
         or (c.first_name || ' ' || c.last_name) ilike ${like} or c.email ilike ${like}
      limit 6`),
    db.execute<{ id: string; title: string; stage: string; company: string }>(sql`
      select d.id, d.title, d.stage, co.name as company from deals d join companies co on co.id = d.company_id
      where d.title ilike ${like} or co.name ilike ${like} limit 4`),
  ]);

  return NextResponse.json({
    results: [
      ...companies.map((c) => ({
        type: "company",
        id: c.id,
        title: c.name,
        subtitle: [INDUSTRIES[c.industry as IndustryKey], c.district ?? c.city].filter(Boolean).join(" · "),
        href: `/unternehmen/${c.id}`,
      })),
      ...contacts.map((c) => ({
        type: "contact",
        id: c.id,
        title: `${c.first_name} ${c.last_name}`.trim() || c.email || "Kontakt",
        subtitle: [c.company, c.email].filter(Boolean).join(" · "),
        href: `/ansprechpartner/${c.id}`,
      })),
      ...deals.map((d) => ({ type: "deal", id: d.id, title: d.title, subtitle: `${d.company} · ${DEAL_STAGES[d.stage as DealStageKey]?.label ?? d.stage}`, href: `/pipeline?deal=${d.id}` })),
    ],
  });
}
