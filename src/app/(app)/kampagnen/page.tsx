import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { campaignStats } from "@/lib/services/campaigns";
import { fmt } from "@/lib/utils";
import { Badge, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Kampagnen" };

export default async function CampaignsPage() {
  await requireUser();
  const [campaigns, stats] = await Promise.all([
    db
      .select({
        c: schema.campaigns,
        recipients: sql<number>`(select count(*)::int from campaign_recipients r where r.campaign_id = ${schema.campaigns.id} and r.status <> 'skipped')`,
        skipped: sql<number>`(select count(*)::int from campaign_recipients r where r.campaign_id = ${schema.campaigns.id} and r.status = 'skipped')`,
      })
      .from(schema.campaigns)
      .orderBy(desc(schema.campaigns.createdAt)),
    campaignStats(),
  ]);
  const tone = { draft: "slate", active: "green", paused: "amber", completed: "blue", archived: "slate" } as const;
  const pct = (a: number, b: number) => (b ? fmt.pct(a / b) : "–");
  return (
    <>
      <PageHeader
        title="Kampagnen"
        description="E-Mail-Sequenzen ausschließlich an Kontakte mit nachgewiesener Werbeerlaubnis."
        actions={
          <Button size="sm" asChild>
            <Link href="/kampagnen/neu">
              <Plus /> Neue Kampagne
            </Link>
          </Button>
        }
      />
      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="Noch keine Kampagnen"
          description="Erstellen Sie eine Sequenz und fügen Sie Ansprechpartner mit Werbeerlaubnis als Empfänger hinzu."
          action={
            <Button size="sm" asChild>
              <Link href="/kampagnen/neu">Kampagne erstellen</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Kampagne</TH>
                <TH>Status</TH>
                <TH className="text-right">Empfänger</TH>
                <TH className="text-right">Versendet</TH>
                <TH className="text-right">Angenommen</TH>
                <TH className="text-right">Unzustellbar</TH>
                <TH className="text-right">Antworten</TH>
                <TH className="text-right">Positiv</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map(({ c, recipients, skipped }) => {
                const s = stats.get(c.id);
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/kampagnen/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.channel === "brevo" ? "Brevo" : "SMTP"} · erstellt {fmt.date(c.createdAt)}
                      </p>
                    </TD>
                    <TD>
                      <Badge tone={tone[c.status]}>{CAMPAIGN_STATUS[c.status]}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {recipients}
                      {skipped ? <span className="block text-[11px] text-muted-foreground">{skipped} übersprungen</span> : null}
                    </TD>
                    <TD className="text-right tabular-nums">{s?.sent ?? 0}</TD>
                    <TD className="text-right tabular-nums">{s?.accepted ?? 0}</TD>
                    <TD className="text-right tabular-nums">{s?.bounced ?? 0}</TD>
                    <TD className="text-right tabular-nums">
                      {s?.replies ?? 0} <span className="text-[11px] text-muted-foreground">{pct(s?.replies ?? 0, s?.accepted ?? 0)}</span>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s?.positive ?? 0} <span className="text-[11px] text-muted-foreground">{pct(s?.positive ?? 0, s?.accepted ?? 0)}</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </>
  );
}
