import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { companyOptions } from "@/lib/services/details";
import { listOwners } from "@/lib/services/queries";
import { fmt, requestTime } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/primitives";
import { DealDialog } from "@/components/forms/sales-dialogs";
import { Button } from "@/components/ui/button";
import { PipelineBoard } from "./board";
import { OwnerFilter } from "./owner-filter";

export const metadata = { title: "Vertriebspipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ deal?: string; owner?: string }> }) {
  await requireUser();
  const { deal, owner } = await searchParams;
  const since = new Date(requestTime() - 90 * 86400_000);
  const [rows, owners, companies] = await Promise.all([
    db
      .select({ d: schema.deals, companyName: schema.companies.name, ownerName: schema.profiles.fullName })
      .from(schema.deals)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.deals.ownerId))
      // Abgeschlossene Deals nur der letzten 90 Tage anzeigen
      .where(and(owner ? eq(schema.deals.ownerId, owner) : undefined, sql`(${schema.deals.stage} not in ('won','lost') or ${schema.deals.updatedAt} >= ${since.toISOString()})`))
      .orderBy(desc(schema.deals.updatedAt)),
    listOwners(),
    companyOptions(),
  ]);
  const open = rows.filter((r) => r.d.stage !== "won" && r.d.stage !== "lost");
  const weighted = open.reduce((s, r) => s + (Number(r.d.monthlyValue) * r.d.probability) / 100, 0);
  const total = open.reduce((s, r) => s + Number(r.d.monthlyValue), 0);
  const wonRecent = rows.filter((r) => r.d.stage === "won" && r.d.closedAt && r.d.closedAt >= since);
  return (
    <>
      <PageHeader
        title="Vertriebspipeline"
        description="Deals per Drag & Drop zwischen den Phasen verschieben. Statusänderungen werden am Unternehmen protokolliert."
        actions={
          <>
            <OwnerFilter owners={owners} value={owner ?? ""} />
            <DealDialog companies={companies} owners={owners} trigger={<Button size="sm">Neuer Deal</Button>} />
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Offene Deals</p>
          <p className="mt-1 text-xl font-semibold">{open.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pipeline (monatlich)</p>
          <p className="mt-1 text-xl font-semibold">{fmt.eur(total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Gewichtet (monatlich)</p>
          <p className="mt-1 text-xl font-semibold">{fmt.eur(weighted)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Gewonnen (90 Tage)</p>
          <p className="mt-1 text-xl font-semibold">{wonRecent.length}</p>
        </Card>
      </div>
      <PipelineBoard
        highlight={deal}
        deals={rows.map((r) => ({
          id: r.d.id,
          title: r.d.title,
          stage: r.d.stage,
          monthlyValue: Number(r.d.monthlyValue),
          probability: r.d.probability,
          companyId: r.d.companyId,
          companyName: r.companyName,
          ownerName: r.ownerName,
          expectedCloseDate: r.d.expectedCloseDate,
          updatedAt: r.d.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
