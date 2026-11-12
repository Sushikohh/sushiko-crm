import { Database, FileSpreadsheet, MapPinned, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { osmEnabled } from "@/lib/finder/osm";
import { listOwners } from "@/lib/services/queries";
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, StatusDot } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/components/csv-import";
import { CompanyFormDialog } from "../unternehmen/company-form";
import { Finder } from "./finder";

export const metadata = { title: "Firmenfinder" };

export default async function FinderPage() {
  await requireUser();
  const owners = await listOwners();
  const osm = osmEnabled();
  return (
    <>
      <PageHeader title="Firmenfinder Hamburg" description="Potenzielle Gewerbekunden über zulässige Datenquellen recherchieren und ins CRM übernehmen." />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="size-4" /> OpenStreetMap
              <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <StatusDot state={osm ? "connected" : "incomplete"} /> {osm ? "Verbunden" : "Nicht verbunden"}
              </span>
            </CardTitle>
            <CardDescription>Offene Geodaten (ODbL) über die Overpass-API: Agenturen, Kanzleien, Coworking-Spaces, Eventlocations, Hotels, Büros u. v. m.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> CSV-Import
              <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <StatusDot state="connected" /> Verfügbar
              </span>
            </CardTitle>
            <CardDescription>Eigene Listen oder lizenzierte Datensätze (z. B. von Adressanbietern) importieren.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CsvImportDialog />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenLine className="size-4" /> Manuelle Erfassung
            </CardTitle>
            <CardDescription>Einzelne Firmen aus eigener Recherche, Empfehlungen oder Netzwerk anlegen.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CompanyFormDialog owners={owners} trigger={<Button size="sm" variant="outline">Unternehmen anlegen</Button>} />
          </CardContent>
        </Card>
      </div>

      <Callout tone="amber" className="mb-6" title="Recherche ≠ Werbeerlaubnis">
        Der Firmenfinder dient ausschließlich der Recherche und Verwaltung von Unternehmen. Öffentlich auffindbare geschäftliche E-Mail-Adressen berechtigen <b>nicht</b> zum Versand von Werbe-E-Mails (§ 7 Abs. 2 Nr. 2 UWG). Der Versand wird über die getrennte Werbeerlaubnis je Ansprechpartner gesteuert. Es wird kein Scraping von Websites durchgeführt.
      </Callout>

      {osm ? (
        <Finder />
      ) : (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Database className="size-8 text-muted-foreground" />
          <p className="font-medium">Keine Online-Datenquelle verbunden</p>
          <p className="max-w-lg text-sm text-muted-foreground">
            Aktivieren Sie OpenStreetMap mit <code className="rounded bg-muted px-1">FINDER_OSM_ENABLED=true</code> in der Umgebungskonfiguration. Bis dahin können Sie Unternehmen per CSV-Import oder manuell erfassen. Es werden keine Beispieldaten als Suchergebnisse angezeigt.
          </p>
        </Card>
      )}
    </>
  );
}
