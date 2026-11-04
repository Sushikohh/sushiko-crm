import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ACQ_STATUS_KEYS, INDUSTRY_KEYS, type AcqStatus, type IndustryKey } from "@/lib/constants";

export const PAGE_SIZE = 50;

export async function listOwners() {
  return db.select({ id: schema.profiles.id, name: schema.profiles.fullName }).from(schema.profiles).where(eq(schema.profiles.active, true)).orderBy(asc(schema.profiles.fullName));
}

type SP = Record<string, string | string[] | undefined>;
const str = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

export function companyWhere(sp: SP): SQL | undefined {
  const c = schema.companies;
  const parts: (SQL | undefined)[] = [isNull(c.mergedIntoId)];
  const q = str(sp, "q").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    parts.push(or(sql`company_fts(${c.name}, ${c.street}, ${c.district}, ${c.postalCode}, ${c.notes}, ${c.tags}) @@ websearch_to_tsquery('german', ${q})`, ilike(c.name, like), ilike(c.postalCode, `${q}%`), ilike(c.district, like)));
  }
  const ind = str(sp, "industry");
  if ((INDUSTRY_KEYS as string[]).includes(ind)) parts.push(eq(c.industry, ind as IndustryKey));
  const st = str(sp, "status");
  if ((ACQ_STATUS_KEYS as string[]).includes(st)) parts.push(eq(c.status, st as AcqStatus));
  const owner = str(sp, "owner");
  if (owner === "none") parts.push(isNull(c.ownerId));
  else if (owner) parts.push(eq(c.ownerId, owner));
  const tag = str(sp, "tag");
  if (tag) parts.push(sql`${tag} = any(${c.tags})`);
  const pot = str(sp, "potential");
  if (pot === "A") parts.push(sql`${c.potentialScore} >= 70`);
  if (pot === "B") parts.push(sql`${c.potentialScore} >= 45 and ${c.potentialScore} < 70`);
  if (pot === "C") parts.push(sql`${c.potentialScore} < 45`);
  const src = str(sp, "source");
  if (src) parts.push(eq(c.source, src));
  if (str(sp, "followup") === "due") parts.push(sql`${c.nextFollowUpAt} <= now()`);
  return and(...parts);
}

export function companyOrder(sort: string) {
  const c = schema.companies;
  const [f, d] = sort.split(":");
  const dir = d === "asc" ? asc : desc;
  switch (f) {
    case "name":
      return [dir(c.name)];
    case "potential":
      return [dir(c.potentialScore), asc(c.name)];
    case "status":
      return [dir(c.status), asc(c.name)];
    case "postal":
      return [dir(c.postalCode), asc(c.name)];
    case "followup":
      return [sql`${c.nextFollowUpAt} ${sql.raw(d === "asc" ? "asc" : "desc")} nulls last`];
    default:
      return [desc(c.createdAt)];
  }
}

export async function listCompanies(sp: SP) {
  const page = Math.max(1, Number(str(sp, "page")) || 1);
  const sort = str(sp, "sort") || "created:desc";
  const where = companyWhere(sp);
  const c = schema.companies;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: c.id,
        name: c.name,
        industry: c.industry,
        postalCode: c.postalCode,
        district: c.district,
        city: c.city,
        status: c.status,
        potentialScore: c.potentialScore,
        tags: c.tags,
        nextFollowUpAt: c.nextFollowUpAt,
        source: c.source,
        ownerName: schema.profiles.fullName,
        contactCount: sql<number>`(select count(*)::int from contacts ct where ct.company_id = ${c.id})`,
      })
      .from(c)
      .leftJoin(schema.profiles, eq(schema.profiles.id, c.ownerId))
      .where(where)
      .orderBy(...companyOrder(sort))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(c).where(where),
  ]);
  return { rows, total, page, sort };
}

export async function allTags() {
  const rows = await db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from companies where merged_into_id is null order by 1 limit 200`);
  return rows.map((r) => r.tag);
}
