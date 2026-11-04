import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ACQ_STATUS_KEYS, INDUSTRY_KEYS, type AcqStatus, type IndustryKey } from "@/lib/constants";
import { permittedContactSql } from "./permissions";
import { PAGE_SIZE } from "./queries";

type SP = Record<string, string | string[] | undefined>;
const str = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

export function contactWhere(sp: SP): SQL | undefined {
  const c = schema.contacts;
  const parts: (SQL | undefined)[] = [];
  const q = str(sp, "q").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    parts.push(
      or(
        sql`contact_fts(${c.firstName}, ${c.lastName}, ${c.email}, ${c.position}, ${c.notes}) @@ websearch_to_tsquery('german', ${q})`,
        sql`(${c.firstName} || ' ' || ${c.lastName}) ilike ${like}`,
        ilike(c.email, like),
        ilike(schema.companies.name, like),
      ),
    );
  }
  const st = str(sp, "status");
  if ((ACQ_STATUS_KEYS as string[]).includes(st)) parts.push(eq(c.status, st as AcqStatus));
  const ind = str(sp, "industry");
  if ((INDUSTRY_KEYS as string[]).includes(ind)) parts.push(eq(schema.companies.industry, ind as IndustryKey));
  const perm = str(sp, "erlaubnis");
  if (perm === "ja") parts.push(sql`${c.email} is not null and ${permittedContactSql}`);
  if (perm === "nein") parts.push(sql`not (${c.email} is not null and ${permittedContactSql})`);
  if (perm === "gesperrt") parts.push(sql`exists (select 1 from suppressions s where lower(s.email) = lower(${c.email}))`);
  if (str(sp, "email") === "ja") parts.push(sql`${c.email} is not null`);
  const tag = str(sp, "tag");
  if (tag) parts.push(sql`${tag} = any(${c.tags})`);
  const company = str(sp, "company");
  if (company) parts.push(eq(c.companyId, company));
  return parts.length ? and(...parts) : undefined;
}

export async function listContacts(sp: SP, opts: { all?: boolean } = {}) {
  const page = Math.max(1, Number(str(sp, "page")) || 1);
  const sort = str(sp, "sort") || "created:desc";
  const where = contactWhere(sp);
  const c = schema.contacts;
  const [f, d] = sort.split(":");
  const dir = d === "asc" ? asc : desc;
  const order = f === "name" ? [dir(c.lastName), dir(c.firstName)] : f === "company" ? [dir(schema.companies.name)] : f === "status" ? [dir(c.status)] : [desc(c.createdAt)];
  const base = db
    .select({
      id: c.id,
      salutation: c.salutation,
      firstName: c.firstName,
      lastName: c.lastName,
      position: c.position,
      email: c.email,
      phone: c.phone,
      status: c.status,
      tags: c.tags,
      companyId: c.companyId,
      companyName: schema.companies.name,
      industry: schema.companies.industry,
      permitted: sql<boolean>`(${c.email} is not null and ${permittedContactSql})`,
      basis: sql<string | null>`(select ep.basis::text from email_permissions ep where lower(ep.email) = lower(${c.email}) limit 1)`,
      suppressed: sql<boolean>`exists (select 1 from suppressions s where lower(s.email) = lower(${c.email}))`,
      createdAt: c.createdAt,
    })
    .from(c)
    .leftJoin(schema.companies, eq(schema.companies.id, c.companyId))
    .where(where)
    .orderBy(...order);
  const rows = opts.all ? await base.limit(20000) : await base.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(c)
    .leftJoin(schema.companies, eq(schema.companies.id, c.companyId))
    .where(where);
  return { rows, total, page, sort };
}
