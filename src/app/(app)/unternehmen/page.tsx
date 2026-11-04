import { Building2, Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ACQ_STATUS, INDUSTRIES } from "@/lib/constants";
import { allTags, listCompanies, listOwners, PAGE_SIZE } from "@/lib/services/queries";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ListFilters, Pagination } from "@/components/list-filters";
import { CsvImportDialog } from "@/components/csv-import";
import { CompanyFormDialog } from "./company-form";
import { CompaniesTable } from "./companies-table";
import { DuplicatesDialog } from "./duplicates-dialog";

export const metadata = { title: "Unternehmen" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const [{ rows, total, page, sort }, owners, tags] = await Promise.all([listCompanies(sp), listOwners(), allTags()]);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Unternehmen"
        description="Alle recherchierten und betreuten Firmen – mit Status, Potenzial und Zuständigkeit."
        actions={
          <>
            <DuplicatesDialog />
            <CsvImportDialog />
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/export/companies?${exportQuery}`}>
                <Download /> Export
              </a>
            </Button>
            <CompanyFormDialog owners={owners} />
          </>
        }
      />
      <ListFilters
        placeholder="Name, PLZ, Stadtteil, Notizen …"
        filters={[
          { key: "industry", label: "Alle Branchen", options: Object.entries(INDUSTRIES).map(([value, label]) => ({ value, label })) },
          { key: "status", label: "Alle Status", options: Object.entries(ACQ_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { key: "potential", label: "Jedes Potenzial", options: [{ value: "A", label: "A – hoch (≥ 70)" }, { value: "B", label: "B – mittel" }, { value: "C", label: "C – niedrig" }] },
          { key: "owner", label: "Alle Zuständigen", options: [{ value: "none", label: "– niemand –" }, ...owners.map((o) => ({ value: o.id, label: o.name }))] },
          { key: "tag", label: "Alle Tags", options: tags.map((t) => ({ value: t, label: t })) },
          { key: "followup", label: "Wiedervorlage", options: [{ value: "due", label: "Fällig" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Building2 className="size-5" />} title="Keine Unternehmen gefunden" description="Legen Sie Unternehmen manuell an, importieren Sie eine CSV-Datei oder nutzen Sie den Firmenfinder." action={<CompanyFormDialog owners={owners} />} />
      ) : (
        <>
          <CompaniesTable rows={rows} sort={sort} owners={owners} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
        </>
      )}
    </>
  );
}
