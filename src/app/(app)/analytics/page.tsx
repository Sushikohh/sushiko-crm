import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { INDUSTRIES, REPLY_CATEGORIES, type IndustryKey, type ReplyCategory } from "@/lib/constants";
import { getCampaignComparison, getContractSeries, getEmailSeries, getFunnel, getIndustryComparison, getKpis, getOwnerPerformance, getReplyCategories, parseFilter } from "@/lib/services/analytics";
import { fmt } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { AnalyticsFilterBar } from "@/components/filter-bar";
import { ChartCard, FunnelCard } from "@/components/charts";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const f = parseFilter(await searchParams);
  const [kpis, emails, funnel, industries, contracts, campaignsCmp, categories, owners, campaigns, profiles] = await Promise.all([
    getKpis(f),
    getEmailSeries(f),
    getFunnel(f),
    getIndustryComparison(f),
    getContractSeries(f),
    getCampaignComparison(f),
    getReplyCategories(f),
    getOwnerPerformance(f),
    db.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns).orderBy(asc(schema.campaigns.name)),
    db.select({ id: schema.profiles.id, name: schema.profiles.fullName }).from(schema.profiles).where(eq(schema.profiles.active, true)),
  ]);
  const rate = (a: number, b: number) => (b ? fmt.pct(a / b) : "–");
  const rates = [
    { label: "Zustellquote", value: rate(kpis.accepted, kpis.sent), hint: "angenommen / versendet" },
    { label: "Bounce-Rate", value: rate(kpis.bounced, kpis.sent), hint: "unzustellbar / versendet" },
    { label: "Antwortquote", value: rate(kpis.replies, kpis.accepted), hint: "Antworten / angenommen" },
    { label: "Positive Quote", value: rate(kpis.positiveReplies, kpis.accepted), hint: "positiv / angenommen" },
    { label: "Termin → Angebot", value: rate(kpis.offersSent, kpis.visits), hint: "Angebote / Termine" },
    { label: "Angebot → Auftrag", value: rate(kpis.contractsWon, kpis.offersSent), hint: "Abschlussquote" },
  ];
  return (
    <>
      <PageHeader title="Analytics" description="Detaillierte Auswertung von Kampagnen, Branchen, Antworten und Abschlüssen." />
      <AnalyticsFilterBar campaigns={campaigns} owners={profiles} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {rates.map((r) => (
          <Card key={r.label} className="p-4">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{r.value}</p>
            <p className="text-[11px] text-muted-foreground">{r.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="E-Mail-Versand und Antworten"
          data={emails.rows}
          xKey="period"
          bucket={emails.bucket}
          series={[
            { key: "sent", label: "Versendet", color: "var(--chart-1)" },
            { key: "accepted", label: "Angenommen", color: "var(--chart-3)" },
            { key: "bounced", label: "Unzustellbar", color: "var(--chart-2)" },
            { key: "replies", label: "Antworten", color: "var(--chart-4)" },
          ]}
        />
        <ChartCard
          title="Antwortquoten im Zeitverlauf"
          data={emails.rows}
          xKey="period"
          bucket={emails.bucket}
          series={[
            { key: "replyRate", label: "Antwortquote", color: "var(--chart-1)", format: "pct" },
            { key: "positiveRate", label: "Positive Antwortquote", color: "var(--chart-3)", format: "pct" },
          ]}
        />
        <FunnelCard data={funnel} />
        <ChartCard
          title="Antworten nach Kategorie"
          kind="bar"
          layout="vertical"
          xLabel="Kategorie"
          data={categories.map((c) => ({ category: c.category === "unclassified" ? "Nicht analysiert" : (REPLY_CATEGORIES[c.category as ReplyCategory]?.label ?? c.category), n: c.n }))}
          xKey="category"
          series={[{ key: "n", label: "Antworten", color: "var(--chart-1)" }]}
          height={Math.max(180, categories.length * 30)}
          empty="Noch keine Antworten."
        />
        <ChartCard title="Gewonnene Aufträge nach Monat" kind="bar" xLabel="Monat" data={contracts} xKey="month" series={[{ key: "won", label: "Aufträge", color: "var(--chart-1)" }]} empty="Noch keine Aufträge." />
        <ChartCard
          title="Event-Umsatz nach Eventmonat"
          kind="bar"
          xLabel="Monat"
          data={contracts}
          xKey="month"
          series={[{ key: "eventRevenue", label: "Event-Umsatz", color: "var(--chart-3)", format: "eur" }]}
          empty="Noch kein Umsatz."
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Branchenvergleich</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Branche</TH>
                  <TH className="text-right">Firmen</TH>
                  <TH className="text-right">Kontaktiert</TH>
                  <TH className="text-right">Antworten</TH>
                  <TH className="text-right">Positiv</TH>
                  <TH className="text-right">Gewonnen</TH>
                  <TH className="text-right">Event-Umsatz</TH>
                </TR>
              </THead>
              <TBody>
                {industries.map((r) => (
                  <TR key={r.industry}>
                    <TD>{INDUSTRIES[r.industry as IndustryKey]}</TD>
                    <TD className="text-right tabular-nums">{r.companies}</TD>
                    <TD className="text-right tabular-nums">{r.contacted}</TD>
                    <TD className="text-right tabular-nums">
                      {r.replies} <span className="text-[11px] text-muted-foreground">{rate(r.replies, r.contacted)}</span>
                    </TD>
                    <TD className="text-right tabular-nums">{r.positive}</TD>
                    <TD className="text-right tabular-nums">{r.won}</TD>
                    <TD className="text-right tabular-nums">{fmt.eur(r.mrr)}</TD>
                  </TR>
                ))}
                {industries.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="py-6 text-center text-muted-foreground">
                      Keine Daten.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kampagnenvergleich</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Kampagne</TH>
                  <TH className="text-right">Versendet</TH>
                  <TH className="text-right">Zugestellt</TH>
                  <TH className="text-right">Bounces</TH>
                  <TH className="text-right">Antworten</TH>
                  <TH className="text-right">Positiv</TH>
                </TR>
              </THead>
              <TBody>
                {campaignsCmp.map((c) => (
                  <TR key={c.id}>
                    <TD>{c.name}</TD>
                    <TD className="text-right tabular-nums">{c.sent}</TD>
                    <TD className="text-right tabular-nums">{rate(c.accepted, c.sent)}</TD>
                    <TD className="text-right tabular-nums">{c.bounced}</TD>
                    <TD className="text-right tabular-nums">
                      {c.replies} <span className="text-[11px] text-muted-foreground">{rate(c.replies, c.accepted)}</span>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.positive} <span className="text-[11px] text-muted-foreground">{rate(c.positive, c.accepted)}</span>
                    </TD>
                  </TR>
                ))}
                {campaignsCmp.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="py-6 text-center text-muted-foreground">
                      Keine Kampagnen.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Mitarbeiter</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Mitarbeiter</TH>
                  <TH className="text-right">Zuständig für Firmen</TH>
                  <TH className="text-right">Offene Deals</TH>
                  <TH className="text-right">Gewonnene Aufträge</TH>
                  <TH className="text-right">Abo-Umsatz mtl.</TH>
                </TR>
              </THead>
              <TBody>
                {owners.map((o) => (
                  <TR key={o.id}>
                    <TD>{o.name}</TD>
                    <TD className="text-right tabular-nums">{o.companies}</TD>
                    <TD className="text-right tabular-nums">{o.deals}</TD>
                    <TD className="text-right tabular-nums">{o.won}</TD>
                    <TD className="text-right tabular-nums">{fmt.eur(o.mrr)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
