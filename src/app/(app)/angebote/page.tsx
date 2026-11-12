import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { FilePlus2, FileText, Pencil } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { CONTRACT_STATUS, OFFER_STATUS } from "@/lib/constants";
import { companyOptions } from "@/lib/services/details";
import { cn, fmt } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ContractDialog } from "./contract-dialog";

export const metadata = { title: "Angebote & Aufträge" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser();
  const { tab = "angebote" } = await searchParams;
  const [offers, contracts, companies, [sum]] = await Promise.all([
    db
      .select({ o: schema.offers, company: schema.companies.name })
      .from(schema.offers)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.offers.companyId))
      .orderBy(desc(schema.offers.createdAt))
      .limit(300),
    db
      .select({ k: schema.contracts, company: schema.companies.name })
      .from(schema.contracts)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.contracts.companyId))
      .orderBy(desc(schema.contracts.startDate)),
    companyOptions(),
    db.execute<{ open: number; openValue: number; mrr: number; active: number }>(sql`
      select (select count(*) from offers where status in ('draft','sent'))::int as open,
             (select coalesce(sum(monthly_net),0) from offers where status = 'sent')::float as "openValue",
             (select coalesce(sum(monthly_value),0) from contracts where status='active' and start_date <= current_date and (end_date is null or end_date >= current_date))::float as mrr,
             (select count(*) from contracts where status='active')::int as active`),
  ]);
  const pill = (a: boolean) => cn("rounded-md border px-2.5 py-1 text-xs", a ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted");
  return (
    <>
      <PageHeader
        title="Angebote & Aufträge"
        description="Catering-Angebote für Events erstellen und nachverfolgen; wiederkehrende Lieferungen als Rahmenvertrag führen."
        actions={
          <>
            <ContractDialog companies={companies} />
            <Button size="sm" asChild>
              <Link href="/angebote/neu">
                <FilePlus2 /> Neues Angebot
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Offene Angebote</p>
          <p className="mt-1 text-xl font-semibold">{sum?.open ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Versendet, offen (mtl.)</p>
          <p className="mt-1 text-xl font-semibold">{fmt.eur(sum?.openValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Aktive Rahmenverträge</p>
          <p className="mt-1 text-xl font-semibold">{sum?.active ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Abo-Umsatz mtl.</p>
          <p className="mt-1 text-xl font-semibold">{fmt.eur(sum?.mrr)}</p>
        </Card>
      </div>
      <div className="mb-4 flex gap-2">
        <Link href="/angebote" className={pill(tab === "angebote")}>
          Angebote ({offers.length})
        </Link>
        <Link href="/angebote?tab=vertraege" className={pill(tab === "vertraege")}>
          Rahmenverträge ({contracts.length})
        </Link>
      </div>
      {tab === "vertraege" ? (
        contracts.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="Noch keine Rahmenverträge" description="Rahmenverträge (z. B. wöchentlicher Team-Lunch) entstehen automatisch aus angenommenen Angeboten mit Abo-Positionen oder werden manuell erfasst." />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Rahmenvertrag</TH>
                  <TH>Unternehmen</TH>
                  <TH className="text-right">Monatlich</TH>
                  <TH className="text-right">Jahreswert</TH>
                  <TH>Laufzeit</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {contracts.map(({ k, company }) => (
                  <TR key={k.id}>
                    <TD className="font-medium">{k.title}</TD>
                    <TD>
                      <Link href={`/unternehmen/${k.companyId}`} className="hover:underline">
                        {company}
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{fmt.eur2(k.monthlyValue)}</TD>
                    <TD className="text-right tabular-nums">{fmt.eur(Number(k.monthlyValue) * 12)}</TD>
                    <TD className="text-xs text-muted-foreground">
                      ab {fmt.date(k.startDate)}
                      {k.endDate ? ` bis ${fmt.date(k.endDate)}` : ""} · {k.noticePeriodMonths} Mon. Frist
                    </TD>
                    <TD>
                      <Badge tone={k.status === "active" ? "green" : "slate"}>{CONTRACT_STATUS[k.status]}</Badge>
                    </TD>
                    <TD>
                      <ContractDialog
                        companies={companies}
                        initial={{ id: k.id, title: k.title, companyId: k.companyId, monthlyValue: String(Number(k.monthlyValue)), startDate: k.startDate, endDate: k.endDate ?? "", noticePeriodMonths: String(k.noticePeriodMonths), serviceScope: k.serviceScope ?? "", status: k.status }}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label="Bearbeiten">
                            <Pencil />
                          </Button>
                        }
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )
      ) : offers.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="Noch keine Angebote"
          action={
            <Button size="sm" asChild>
              <Link href="/angebote/neu">Angebot erstellen</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Nummer</TH>
                <TH>Titel</TH>
                <TH>Unternehmen</TH>
                <TH className="text-right">Monatlich netto</TH>
                <TH>Gültig bis</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {offers.map(({ o, company }) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/angebote/${o.id}`} className="font-medium hover:underline">
                      {o.number}
                    </Link>
                  </TD>
                  <TD>{o.title}</TD>
                  <TD>
                    <Link href={`/unternehmen/${o.companyId}`} className="hover:underline">
                      {company}
                    </Link>
                  </TD>
                  <TD className="text-right tabular-nums">{fmt.eur2(o.monthlyNet)}</TD>
                  <TD className={cn("text-xs", o.validUntil && new Date(o.validUntil) < new Date() && o.status === "sent" ? "font-medium text-amber-600" : "text-muted-foreground")}>{fmt.date(o.validUntil)}</TD>
                  <TD>
                    <Badge tone={o.status === "accepted" ? "green" : o.status === "rejected" ? "red" : o.status === "sent" ? "blue" : "slate"}>{OFFER_STATUS[o.status]}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </>
  );
}
