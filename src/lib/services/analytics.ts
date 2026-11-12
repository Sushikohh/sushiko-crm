import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ACQ_STATUS_KEYS, INDUSTRY_KEYS } from "@/lib/constants";

/** Filter für Dashboard & Analytics – alle Werte werden aus gespeicherten Daten berechnet. */
export const analyticsFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  industry: z.enum(INDUSTRY_KEYS as [string, ...string[]]).optional(),
  campaignId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  status: z.enum(ACQ_STATUS_KEYS as [string, ...string[]]).optional(),
});
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;

export function parseFilter(sp: Record<string, string | string[] | undefined>): AnalyticsFilter & { range: string } {
  const get = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const range = get("range") ?? "90d";
  const now = new Date();
  let from: Date | undefined;
  let to: Date | undefined;
  if (range === "custom") {
    from = get("from") ? new Date(get("from")!) : undefined;
    to = get("to") ? new Date(`${get("to")}T23:59:59`) : undefined;
  } else if (range === "ytd") from = new Date(now.getFullYear(), 0, 1);
  else if (range !== "all") {
    const days = Number(range.replace("d", "")) || 90;
    from = new Date(now.getTime() - days * 86400_000);
  }
  const parsed = analyticsFilterSchema.safeParse({ from, to, industry: get("industry"), campaignId: get("campaign"), ownerId: get("owner"), status: get("status") });
  return { ...(parsed.success ? parsed.data : {}), range };
}

function companyFilter(f: AnalyticsFilter, alias = "co"): SQL {
  const parts: SQL[] = [sql.raw(`${alias}.merged_into_id is null`)];
  if (f.industry) parts.push(sql`${sql.raw(alias)}.industry = ${f.industry}`);
  if (f.ownerId) parts.push(sql`${sql.raw(alias)}.owner_id = ${f.ownerId}`);
  if (f.status) parts.push(sql`${sql.raw(alias)}.status = ${f.status}`);
  return sql.join(parts, sql` and `);
}
const hasCompanyFilter = (f: AnalyticsFilter) => !!(f.industry || f.ownerId || f.status);

function dateRange(col: string, f: AnalyticsFilter): SQL {
  const parts: SQL[] = [sql`true`];
  if (f.from) parts.push(sql`${sql.raw(col)} >= ${f.from.toISOString()}`);
  if (f.to) parts.push(sql`${sql.raw(col)} <= ${f.to.toISOString()}`);
  return sql.join(parts, sql` and `);
}

function messageScope(f: AnalyticsFilter, alias = "m"): SQL {
  const parts: SQL[] = [sql`true`];
  if (f.campaignId) parts.push(sql`${sql.raw(alias)}.campaign_id = ${f.campaignId}`);
  if (hasCompanyFilter(f)) parts.push(sql`exists (select 1 from companies co where co.id = ${sql.raw(alias)}.company_id and ${companyFilter(f)})`);
  return sql.join(parts, sql` and `);
}

function companyScope(f: AnalyticsFilter, col: string): SQL {
  if (!hasCompanyFilter(f) && !f.campaignId) return sql`true`;
  const parts: SQL[] = [];
  if (hasCompanyFilter(f)) parts.push(sql`exists (select 1 from companies co where co.id = ${sql.raw(col)} and ${companyFilter(f)})`);
  if (f.campaignId)
    parts.push(sql`exists (select 1 from campaign_recipients cr join contacts ct on ct.id = cr.contact_id where cr.campaign_id = ${f.campaignId} and ct.company_id = ${sql.raw(col)})`);
  return sql.join(parts, sql` and `);
}

export type Kpis = {
  companies: number;
  contacts: number;
  permittedContacts: number;
  sent: number;
  accepted: number;
  bounced: number;
  replies: number;
  positiveReplies: number;
  visits: number;
  offersSent: number;
  /** Angenommene Angebote (Catering-Aufträge) im Zeitraum */
  contractsWon: number;
  /** Event-Umsatz netto aus angenommenen Angeboten im Zeitraum */
  eventRevenue: number;
  mrr: number;
  annualValue: number;
  pipelineValue: number;
};

export async function getKpis(f: AnalyticsFilter): Promise<Kpis> {
  const [r] = await db.execute<Record<keyof Kpis, string | number>>(sql`
    select
      (select count(*) from companies co where ${companyFilter(f)} and ${dateRange("co.captured_at", f)}
        and ${f.campaignId ? companyScope(f, "co.id") : sql`true`})::int as "companies",
      (select count(*) from contacts c where ${dateRange("c.created_at", f)} and ${companyScope(f, "c.company_id")})::int as "contacts",
      (select count(*) from contacts where contacts.email is not null and ${companyScope(f, "contacts.company_id")} and exists (
        select 1 from email_permissions ep where lower(ep.email) = lower(contacts.email)
          and ep.basis in ('express_consent','double_opt_in','existing_customer') and ep.revoked_at is null
          and (ep.basis <> 'double_opt_in' or ep.doi_confirmed_at is not null)
          and (ep.basis = 'double_opt_in' or coalesce(ep.evidence,'') <> ''))
        and not exists (select 1 from suppressions s where lower(s.email) = lower(contacts.email)))::int as "permittedContacts",
      (select count(*) from email_messages m where m.direction='outbound' and m.status in ('accepted','delivered','bounced') and ${dateRange("m.sent_at", f)} and ${messageScope(f)})::int as "sent",
      (select count(*) from email_messages m where m.direction='outbound' and m.status in ('accepted','delivered') and ${dateRange("m.sent_at", f)} and ${messageScope(f)})::int as "accepted",
      (select count(*) from email_messages m where m.direction='outbound' and m.status='bounced' and ${dateRange("coalesce(m.bounced_at, m.created_at)", f)} and ${messageScope(f)})::int as "bounced",
      (select count(*) from email_messages m where m.direction='inbound' and m.kind in ('reply','inbound') and ${dateRange("m.received_at", f)} and ${messageScope(f)})::int as "replies",
      (select count(*) from email_messages m where m.direction='inbound' and m.ai_category in ('interested','meeting_request') and ${dateRange("m.received_at", f)} and ${messageScope(f)})::int as "positiveReplies",
      (select count(*) from appointments a where a.status <> 'cancelled' and ${dateRange("a.starts_at", f)} and ${companyScope(f, "a.company_id")})::int as "visits",
      (select count(*) from offers o where o.sent_at is not null and ${dateRange("o.sent_at", f)} and ${companyScope(f, "o.company_id")})::int as "offersSent",
      (select count(*) from offers o where o.status = 'accepted' and ${dateRange("coalesce(o.decided_at, o.updated_at)", f)} and ${companyScope(f, "o.company_id")})::int as "contractsWon",
      (select coalesce(sum(o.one_time_net),0) from offers o where o.status = 'accepted' and ${dateRange("coalesce(o.event_date, o.decided_at, o.updated_at)", f)} and ${companyScope(f, "o.company_id")})::float as "eventRevenue",
      (select coalesce(sum(k.monthly_value),0) from contracts k where k.status = 'active' and k.start_date <= current_date
        and (k.end_date is null or k.end_date >= current_date) and ${companyScope(f, "k.company_id")})::float as "mrr",
      (select coalesce(sum(d.monthly_value * d.probability / 100.0),0) from deals d where d.stage not in ('won','lost') and ${companyScope(f, "d.company_id")})::float as "pipelineValue"
  `);
  const mrr = Number(r.mrr);
  return {
    companies: Number(r.companies),
    contacts: Number(r.contacts),
    permittedContacts: Number(r.permittedContacts),
    sent: Number(r.sent),
    accepted: Number(r.accepted),
    bounced: Number(r.bounced),
    replies: Number(r.replies),
    positiveReplies: Number(r.positiveReplies),
    visits: Number(r.visits),
    offersSent: Number(r.offersSent),
    contractsWon: Number(r.contractsWon),
    eventRevenue: Number(r.eventRevenue),
    mrr,
    annualValue: mrr * 12,
    pipelineValue: Number(r.pipelineValue),
  };
}

function bucket(f: AnalyticsFilter): "day" | "week" | "month" {
  const from = f.from ?? new Date(Date.now() - 365 * 86400_000);
  const days = ((f.to ?? new Date()).getTime() - from.getTime()) / 86400_000;
  return days <= 31 ? "day" : days <= 200 ? "week" : "month";
}

export async function getEmailSeries(f: AnalyticsFilter) {
  const b = bucket(f);
  const from = f.from ?? (await firstActivity());
  const to = f.to ?? new Date();
  const rows = await db.execute<{ period: string; sent: number; accepted: number; bounced: number; replies: number; positive: number }>(sql`
    with periods as (
      select generate_series(date_trunc(${b}, ${from.toISOString()}::timestamptz), date_trunc(${b}, ${to.toISOString()}::timestamptz), ('1 ' || ${b})::interval) as p
    )
    select to_char(p, 'YYYY-MM-DD') as period,
      (select count(*) from email_messages m where m.direction='outbound' and m.status in ('accepted','delivered','bounced') and date_trunc(${b}, m.sent_at) = p and ${messageScope(f)})::int as sent,
      (select count(*) from email_messages m where m.direction='outbound' and m.status in ('accepted','delivered') and date_trunc(${b}, m.sent_at) = p and ${messageScope(f)})::int as accepted,
      (select count(*) from email_messages m where m.direction='outbound' and m.status='bounced' and date_trunc(${b}, coalesce(m.bounced_at, m.sent_at)) = p and ${messageScope(f)})::int as bounced,
      (select count(*) from email_messages m where m.direction='inbound' and m.kind in ('reply','inbound') and date_trunc(${b}, m.received_at) = p and ${messageScope(f)})::int as replies,
      (select count(*) from email_messages m where m.direction='inbound' and m.ai_category in ('interested','meeting_request') and date_trunc(${b}, m.received_at) = p and ${messageScope(f)})::int as positive
    from periods order by p`);
  return {
    bucket: b,
    rows: rows.map((r) => ({
      ...r,
      replyRate: r.accepted ? r.replies / r.accepted : 0,
      positiveRate: r.accepted ? r.positive / r.accepted : 0,
    })),
  };
}

async function firstActivity() {
  const [r] = await db.execute<{ d: string | null }>(sql`select least((select min(created_at) from email_messages), (select min(created_at) from companies), (select min(start_date)::timestamptz from contracts)) as d`);
  return r?.d ? new Date(r.d) : new Date(Date.now() - 90 * 86400_000);
}

export async function getIndustryComparison(f: AnalyticsFilter) {
  return db.execute<{ industry: string; companies: number; contacted: number; replies: number; positive: number; won: number; mrr: number }>(sql`
    select co.industry,
      count(*)::int as companies,
      count(*) filter (where exists (select 1 from email_messages m where m.company_id = co.id and m.direction='outbound' and m.status in ('accepted','delivered') and ${dateRange("m.sent_at", f)} and ${f.campaignId ? sql`m.campaign_id = ${f.campaignId}` : sql`true`}))::int as contacted,
      count(*) filter (where exists (select 1 from email_messages m where m.company_id = co.id and m.direction='inbound' and m.kind in ('reply','inbound') and ${dateRange("m.received_at", f)}))::int as replies,
      count(*) filter (where exists (select 1 from email_messages m where m.company_id = co.id and m.ai_category in ('interested','meeting_request') and ${dateRange("m.received_at", f)}))::int as positive,
      count(*) filter (where exists (select 1 from offers o where o.company_id = co.id and o.status = 'accepted'))::int as won,
      coalesce(sum((select sum(o.one_time_net) from offers o where o.company_id = co.id and o.status = 'accepted' and ${dateRange("coalesce(o.event_date, o.decided_at)", f)})),0)::float as mrr
    from companies co where ${companyFilter(f)} and ${f.campaignId ? companyScope(f, "co.id") : sql`true`}
    group by co.industry order by companies desc`);
}

export async function getFunnel(f: AnalyticsFilter) {
  const [r] = await db.execute<{ researched: number; contacted: number; replied: number; positive: number; visits: number; offers: number; won: number }>(sql`
    with fc as (select co.id from companies co where ${companyFilter(f)} and ${f.campaignId ? companyScope(f, "co.id") : sql`true`})
    select
      (select count(*) from fc)::int as researched,
      (select count(distinct m.company_id) from email_messages m where m.company_id in (select id from fc) and m.direction='outbound' and m.status in ('accepted','delivered') and ${dateRange("m.sent_at", f)})::int as contacted,
      (select count(distinct m.company_id) from email_messages m where m.company_id in (select id from fc) and m.direction='inbound' and m.kind in ('reply','inbound') and ${dateRange("m.received_at", f)})::int as replied,
      (select count(distinct m.company_id) from email_messages m where m.company_id in (select id from fc) and m.ai_category in ('interested','meeting_request') and ${dateRange("m.received_at", f)})::int as positive,
      (select count(distinct a.company_id) from appointments a where a.company_id in (select id from fc) and a.status <> 'cancelled' and ${dateRange("a.starts_at", f)})::int as visits,
      (select count(distinct o.company_id) from offers o where o.company_id in (select id from fc) and o.sent_at is not null and ${dateRange("o.sent_at", f)})::int as offers,
      (select count(distinct o.company_id) from offers o where o.company_id in (select id from fc) and o.status = 'accepted' and ${dateRange("coalesce(o.decided_at, o.updated_at)", f)})::int as won`);
  return [
    { stage: "Recherchiert", value: r.researched },
    { stage: "Kontaktiert", value: r.contacted },
    { stage: "Geantwortet", value: r.replied },
    { stage: "Positiv", value: r.positive },
    { stage: "Termin/Verkostung", value: r.visits },
    { stage: "Angebot", value: r.offers },
    { stage: "Gewonnen", value: r.won },
  ];
}

/** Monatsreihe: gewonnene Aufträge, Event-Umsatz (nach Eventdatum), Abo-Umsatz (Rahmenverträge) und Gesamtumsatz. */
export async function getContractSeries(f: AnalyticsFilter) {
  const from = f.from ?? new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1);
  const to = f.to ?? new Date();
  return db.execute<{ month: string; won: number; eventRevenue: number; newMrr: number; mrr: number; revenue: number }>(sql`
    with months as (select generate_series(date_trunc('month', ${from.toISOString()}::timestamptz), date_trunc('month', ${to.toISOString()}::timestamptz), interval '1 month') as m),
    k as (select * from contracts k where ${companyScope(f, "k.company_id")}),
    o as (select * from offers o where o.status = 'accepted' and ${companyScope(f, "o.company_id")}),
    base as (
      select m,
        (select count(*) from o where date_trunc('month', coalesce(o.decided_at, o.updated_at)) = m)::int as won,
        (select coalesce(sum(o.one_time_net),0) from o where date_trunc('month', coalesce(o.event_date, o.decided_at)) = m)::float as "eventRevenue",
        (select coalesce(sum(k.monthly_value),0) from k where date_trunc('month', k.start_date::timestamptz) = m)::float as "newMrr",
        (select coalesce(sum(k.monthly_value),0) from k where k.start_date < (m + interval '1 month') and (k.end_date is null or k.end_date >= m) and k.status <> 'paused')::float as mrr
      from months
    )
    select to_char(m, 'YYYY-MM') as month, won, "eventRevenue", "newMrr", mrr, ("eventRevenue" + mrr)::float as revenue
    from base order by m`);
}

export async function getCampaignComparison(f: AnalyticsFilter) {
  return db.execute<{ id: string; name: string; sent: number; accepted: number; bounced: number; replies: number; positive: number }>(sql`
    select c.id, c.name,
      count(m.*) filter (where m.direction='outbound' and m.status in ('accepted','delivered','bounced'))::int as sent,
      count(m.*) filter (where m.direction='outbound' and m.status in ('accepted','delivered'))::int as accepted,
      count(m.*) filter (where m.direction='outbound' and m.status='bounced')::int as bounced,
      count(m.*) filter (where m.direction='inbound' and m.kind in ('reply','inbound'))::int as replies,
      count(m.*) filter (where m.direction='inbound' and m.ai_category in ('interested','meeting_request'))::int as positive
    from campaigns c left join email_messages m on m.campaign_id = c.id and ${dateRange("coalesce(m.sent_at, m.received_at, m.created_at)", f)} and ${messageScope(f)}
    where ${f.campaignId ? sql`c.id = ${f.campaignId}` : sql`true`}
    group by c.id, c.name order by c.name`);
}

export async function getReplyCategories(f: AnalyticsFilter) {
  return db.execute<{ category: string; n: number }>(sql`
    select coalesce(m.ai_category, 'unclassified') as category, count(*)::int as n
    from email_messages m where m.direction='inbound' and m.kind in ('reply','inbound') and ${dateRange("m.received_at", f)} and ${messageScope(f)}
    group by 1 order by 2 desc`);
}

export async function getOwnerPerformance(f: AnalyticsFilter) {
  return db.execute<{ id: string; name: string; companies: number; deals: number; won: number; mrr: number }>(sql`
    select p.id, p.full_name as name,
      (select count(*) from companies co where co.owner_id = p.id and ${companyFilter({ ...f, ownerId: undefined })})::int as companies,
      (select count(*) from deals d where d.owner_id = p.id and d.stage not in ('won','lost'))::int as deals,
      (select count(*) from offers o where o.owner_id = p.id and o.status = 'accepted' and ${dateRange("coalesce(o.decided_at, o.updated_at)", f)})::int as won,
      (select coalesce(sum(k.monthly_value),0) from contracts k where k.owner_id = p.id and k.status = 'active')::float as mrr
    from profiles p where p.active order by p.full_name`);
}
