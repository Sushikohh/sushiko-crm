import { inArray } from "drizzle-orm";
import { Download, Users } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ACQ_STATUS, INDUSTRIES } from "@/lib/constants";
import { listContacts } from "@/lib/services/contact-queries";
import { companyOptions } from "@/lib/services/details";
import { PAGE_SIZE } from "@/lib/services/queries";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ListFilters, Pagination } from "@/components/list-filters";
import { ContactDialog } from "@/components/forms/contact-dialog";
import { CsvImportDialog } from "@/components/csv-import";
import { ContactsTable } from "./contacts-table";

export const metadata = { title: "Ansprechpartner" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const [{ rows, total, page, sort }, companies, campaigns] = await Promise.all([
    listContacts(sp),
    companyOptions(),
    db.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns).where(inArray(schema.campaigns.status, ["draft", "active", "paused"])),
  ]);
  const exportQuery = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Ansprechpartner"
        description="Kontaktpersonen in Ihren Zielunternehmen. Vertriebsstatus und Werbeerlaubnis werden getrennt geführt."
        actions={
          <>
            <CsvImportDialog />
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/export/contacts?${exportQuery}`}>
                <Download /> Export
              </a>
            </Button>
            <ContactDialog companies={companies} />
          </>
        }
      />
      <ListFilters
        placeholder="Name, E-Mail, Funktion, Firma …"
        filters={[
          { key: "status", label: "Alle Status", options: Object.entries(ACQ_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { key: "erlaubnis", label: "Werbeerlaubnis", options: [{ value: "ja", label: "Versandberechtigt" }, { value: "nein", label: "Nicht berechtigt" }, { value: "gesperrt", label: "Gesperrt / Widerspruch" }] },
          { key: "industry", label: "Alle Branchen", options: Object.entries(INDUSTRIES).map(([value, label]) => ({ value, label })) },
          { key: "email", label: "E-Mail", options: [{ value: "ja", label: "Mit E-Mail-Adresse" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="Keine Ansprechpartner gefunden" description="Legen Sie Ansprechpartner direkt oder auf der Seite eines Unternehmens an." action={<ContactDialog companies={companies} />} />
      ) : (
        <>
          <ContactsTable rows={rows} sort={sort} campaigns={campaigns} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
        </>
      )}
    </>
  );
}
