import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, Building2, CalendarCheck, CheckCircle2, FileText, Inbox, MailCheck, MailX, Send, ShieldCheck, ThumbsUp, Trophy, Users } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getContractSeries, getEmailSeries, getFunnel, getIndustryComparison, getKpis, parseFilter } from "@/lib/services/analytics";
import { INDUSTRIES, type IndustryKey } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/primitives";
import { AnalyticsFilterBar } from "@/components/filter-bar";
import { ChartCard, FunnelCard } from "@/components/charts";
import { SetupChecklist } from "./setup-checklist";

export const metadata = { title: "Dashboard" };

function Kpi({ label, value, icon: Icon, hint, href }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; hint?: string; href?: string }) {
  const body = (
    <Card className="group h-full p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground/70" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filter = parseFilter(await searchParams);
  const [kpis, emails, funnel, industries, contracts, campaigns, owners] = await Promise.all([
    getKpis(filter),
    getEmailSeries(filter),
    getFunnel(filter),
    getIndustryComparison(filter),
    getContractSeries(filter),
    db.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns).orderBy(asc(schema.campaigns.name)),
    db.select({ id: schema.profiles.id, name: schema.profiles.fullName }).from(schema.profiles).where(eq(schema.profiles.active, true)),
  ]);
  const rate = (a: number, b: number) => (b ? fmt.pct(a / b) : "–");

  return (
    <>
      <PageHeader title={`Guten Tag, ${user.fullName.split(" ")[0]}`} description="Überblick über Akquise, Anfragen und Catering-Aufträge." />
      <SetupChecklist />
      <AnalyticsFilterBar campaigns={campaigns} owners={owners} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
        <Kpi label="Recherchierte Unternehmen" value={fmt.num(kpis.companies)} icon={Building2} href="/unternehmen" />
        <Kpi label="Ansprechpartner" value={fmt.num(kpis.contacts)} icon={Users} href="/ansprechpartner" />
        <Kpi label="Mit Werbeerlaubnis" value={fmt.num(kpis.permittedContacts)} icon={ShieldCheck} hint="nachgewiesen, nicht gesperrt" href="/ansprechpartner?erlaubnis=ja" />
        <Kpi label="Versendete E-Mails" value={fmt.num(kpis.sent)} icon={Send} />
        <Kpi label="Vom Server angenommen" value={fmt.num(kpis.accepted)} icon={MailCheck} hint={rate(kpis.accepted, kpis.sent)} />
        <Kpi label="Unzustellbar" value={fmt.num(kpis.bounced)} icon={MailX} hint={`Bounce-Rate ${rate(kpis.bounced, kpis.sent)}`} />
        <Kpi label="Antworten" value={fmt.num(kpis.replies)} icon={Inbox} hint={`Antwortquote ${rate(kpis.replies, kpis.accepted)}`} href="/postfach" />
        <Kpi label="Positive Antworten" value={fmt.num(kpis.positiveReplies)} icon={ThumbsUp} hint={rate(kpis.positiveReplies, kpis.accepted)} />
        <Kpi label="Verkostungen & Termine" value={fmt.num(kpis.visits)} icon={CalendarCheck} href="/aufgaben?tab=termine" />
        <Kpi label="Versendete Angebote" value={fmt.num(kpis.offersSent)} icon={FileText} href="/angebote" />
        <Kpi label="Gewonnene Aufträge" value={fmt.num(kpis.contractsWon)} icon={Trophy} hint="angenommene Angebote" href="/angebote" />
        <Kpi label="Event-Umsatz" value={fmt.eur(kpis.eventRevenue)} icon={CheckCircle2} hint="netto, angenommene Angebote" />
        <Kpi label="Abo-Umsatz monatlich" value={fmt.eur(kpis.mrr)} icon={CheckCircle2} hint="Rahmenverträge (z. B. Lunch), netto" />
        <Kpi label="Abo-Jahreswert" value={fmt.eur(kpis.annualValue)} icon={Trophy} hint="Abo-Umsatz × 12" />
        <Kpi label="Gewichtete Pipeline" value={fmt.eur(kpis.pipelineValue)} icon={ArrowRight} hint="Auftragswert nach Wahrscheinlichkeit" href="/pipeline" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="E-Mail-Versandentwicklung"
          description="Versendet, angenommen, unzustellbar und Antworten"
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
          title="Antwortquoten"
          description="Antworten bzw. positive Antworten je angenommener E-Mail"
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
          title="Branchenvergleich"
          description="Positive Antworten je Branche"
          kind="bar"
          layout="vertical"
          xLabel="Branche"
          data={industries.map((r) => ({ ...r, industry: INDUSTRIES[r.industry as IndustryKey] ?? r.industry }))}
          xKey="industry"
          series={[{ key: "positive", label: "Positive Antworten", color: "var(--chart-1)" }]}
          height={Math.max(200, industries.length * 30)}
          empty="Noch keine Antworten nach Branche."
        />
        <ChartCard
          title="Gewonnene Aufträge nach Monat"
          kind="bar"
          xLabel="Monat"
          data={contracts}
          xKey="month"
          series={[{ key: "won", label: "Aufträge", color: "var(--chart-1)" }]}
          empty="Noch keine Aufträge gewonnen."
        />
        <ChartCard
          title="Umsatzentwicklung"
          description="Event-Umsatz (nach Eventmonat) plus Abo-Umsatz, netto"
          kind="area"
          xLabel="Monat"
          data={contracts}
          xKey="month"
          series={[{ key: "revenue", label: "Umsatz", color: "var(--chart-3)", format: "eur" }]}
          empty="Noch kein Umsatz erfasst."
        />
      </div>
    </>
  );
}
