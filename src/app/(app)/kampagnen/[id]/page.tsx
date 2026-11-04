import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { brevoConfigured } from "@/lib/mail/brevo";
import { listMailboxes } from "@/lib/mail/mailbox";
import { CAMPAIGN_STATUS, RECIPIENT_STATUS } from "@/lib/constants";
import { campaignReadiness, campaignStats } from "@/lib/services/campaigns";
import { allTags } from "@/lib/services/queries";
import { fmt } from "@/lib/utils";
import { Badge, Card, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { CampaignEditor } from "../campaign-editor";
import { AddRecipients, CampaignControls, Readiness, RemoveRecipient } from "./controls";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { status: rf } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
  if (!c) notFound();
  const [steps, recipients, counts, stats, readiness, mailboxes, tags] = await Promise.all([
    db.select().from(schema.campaignSteps).where(eq(schema.campaignSteps.campaignId, id)).orderBy(asc(schema.campaignSteps.stepOrder)),
    db
      .select({ r: schema.campaignRecipients, contact: schema.contacts, company: schema.companies.name })
      .from(schema.campaignRecipients)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.campaignRecipients.contactId))
      .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(rf ? sql`${schema.campaignRecipients.campaignId} = ${id} and ${schema.campaignRecipients.status} = ${rf}` : eq(schema.campaignRecipients.campaignId, id))
      .orderBy(desc(schema.campaignRecipients.lastSentAt), asc(schema.contacts.lastName))
      .limit(500),
    db
      .select({ status: schema.campaignRecipients.status, n: sql<number>`count(*)::int` })
      .from(schema.campaignRecipients)
      .where(eq(schema.campaignRecipients.campaignId, id))
      .groupBy(schema.campaignRecipients.status),
    campaignStats(id),
    campaignReadiness(id),
    listMailboxes(),
    allTags(),
  ]);
  const s = stats.get(id);
  const total = counts.reduce((a, b) => a + b.n, 0);
  const tone = { pending: "slate", in_progress: "blue", completed: "slate", replied: "green", bounced: "red", unsubscribed: "red", skipped: "amber", failed: "red" } as const;
  const kpi = (label: string, v: number | string, sub?: string) => (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </Card>
  );
  const pct = (a: number, b: number) => (b ? fmt.pct(a / b) : "–");

  return (
    <>
      <Link href="/kampagnen" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Kampagnen
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
            <Badge tone={c.status === "active" ? "green" : c.status === "paused" ? "amber" : "slate"}>{CAMPAIGN_STATUS[c.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {steps.length} Schritte · {c.channel === "brevo" ? "Brevo" : "SMTP"} · {c.dailyLimit}/Tag · {c.sendWindowStart}–{c.sendWindowEnd} Uhr{c.sendWeekdaysOnly ? ", werktags" : ""}
            {c.startedAt ? ` · gestartet ${fmt.date(c.startedAt)}` : ""}
          </p>
        </div>
        <CampaignControls id={id} status={c.status} canDelete={!s?.sent} />
      </div>
      {c.status !== "active" && c.status !== "archived" && c.status !== "completed" ? <Readiness problems={readiness.problems} /> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpi("Empfänger", total, `${counts.find((x) => x.status === "skipped")?.n ?? 0} übersprungen`)}
        {kpi("Versendet", s?.sent ?? 0)}
        {kpi("Angenommen", s?.accepted ?? 0, pct(s?.accepted ?? 0, s?.sent ?? 0))}
        {kpi("Unzustellbar", s?.bounced ?? 0, pct(s?.bounced ?? 0, s?.sent ?? 0))}
        {kpi("Antworten", s?.replies ?? 0, pct(s?.replies ?? 0, s?.accepted ?? 0))}
        {kpi("Positiv", s?.positive ?? 0, pct(s?.positive ?? 0, s?.accepted ?? 0))}
      </div>

      <Tabs defaultValue="recipients">
        <TabsList>
          <TabsTrigger value="recipients">Empfänger</TabsTrigger>
          <TabsTrigger value="edit">Sequenz & Einstellungen</TabsTrigger>
        </TabsList>
        <TabsContent value="recipients">
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div>
              <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
                <Link href={`/kampagnen/${id}`} className={`rounded-md border px-2 py-1 ${!rf ? "bg-muted" : ""}`}>
                  Alle ({total})
                </Link>
                {counts.map((x) => (
                  <Link key={x.status} href={`/kampagnen/${id}?status=${x.status}`} className={`rounded-md border px-2 py-1 ${rf === x.status ? "bg-muted" : ""}`}>
                    {RECIPIENT_STATUS[x.status]} ({x.n})
                  </Link>
                ))}
              </div>
              <div className="rounded-xl border bg-card">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Empfänger</TH>
                      <TH>Status</TH>
                      <TH>Schritt</TH>
                      <TH>Zuletzt</TH>
                      <TH>Nächster Versand</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {recipients.length === 0 ? (
                      <TR>
                        <TD colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          Noch keine Empfänger.
                        </TD>
                      </TR>
                    ) : null}
                    {recipients.map(({ r, contact, company }) => (
                      <TR key={r.id}>
                        <TD>
                          <Link href={`/ansprechpartner/${contact.id}`} className="font-medium hover:underline">
                            {`${contact.firstName} ${contact.lastName}`.trim() || contact.email}
                          </Link>
                          <p className="text-xs text-muted-foreground">{[company, contact.email].filter(Boolean).join(" · ")}</p>
                        </TD>
                        <TD>
                          <Badge tone={tone[r.status]}>{RECIPIENT_STATUS[r.status]}</Badge>
                          {r.skipReason ? <p className="mt-0.5 max-w-64 text-[11px] text-muted-foreground">{r.skipReason}</p> : null}
                        </TD>
                        <TD className="text-xs tabular-nums">
                          {r.currentStep}/{steps.length}
                        </TD>
                        <TD className="text-xs text-muted-foreground">{fmt.dateTime(r.lastSentAt)}</TD>
                        <TD className="text-xs text-muted-foreground">{fmt.dateTime(r.nextSendAt)}</TD>
                        <TD>{r.currentStep === 0 ? <RemoveRecipient campaignId={id} recipientId={r.id} /> : null}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
            <AddRecipients id={id} tags={tags} />
          </div>
        </TabsContent>
        <TabsContent value="edit">
          <CampaignEditor
            mailboxes={mailboxes.map((m) => ({ id: m.id, email: m.email }))}
            aiConnected={aiStatus().connected}
            brevoConnected={brevoConfigured()}
            initial={{
              id: c.id,
              name: c.name,
              description: c.description ?? "",
              channel: c.channel,
              mailboxId: c.mailboxId ?? "",
              targetIndustries: c.targetIndustries,
              dailyLimit: c.dailyLimit,
              sendWindowStart: c.sendWindowStart,
              sendWindowEnd: c.sendWindowEnd,
              sendWeekdaysOnly: c.sendWeekdaysOnly,
              minDelaySeconds: c.minDelaySeconds,
              aiPersonalize: c.aiPersonalize,
              stopOnReply: c.stopOnReply,
              steps: steps.map((x) => ({ delayDays: x.delayDays, subject: x.subject, body: x.body })),
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
