import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CsvCompanyRow } from "@/lib/finder/csv";
import type { FinderResult } from "@/lib/finder/osm";
import { normalizeEmail } from "@/lib/normalize";
import { logActivity } from "./audit";
import { createCompany, findCompanyDuplicates } from "./companies";
import { createContact, findContactByEmail } from "./contacts";
import { setPermission } from "./permissions";

export type ImportSummary = { created: number; duplicates: number; contacts: number; consents: number; errors: { line: number; message: string }[] };

/** Importiert CSV-Zeilen. Sicheres Duplikat (≥ 90 %) → übersprungen; Kontakt wird ggf. ergänzt. */
export async function importCsvRows(rows: CsvCompanyRow[], actorId: string, opts: { tag?: string } = {}): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, duplicates: 0, contacts: 0, consents: 0, errors: [] };
  for (const r of rows) {
    try {
      const dupes = await findCompanyDuplicates({ name: r.name, website: r.website, email: r.email, phone: r.phone, postalCode: r.postalCode });
      let companyId: string;
      if (dupes[0] && dupes[0].score >= 0.9) {
        summary.duplicates++;
        companyId = dupes[0].id;
      } else {
        const c = await createCompany(
          {
            name: r.name,
            industry: r.industry,
            street: r.street,
            postalCode: r.postalCode,
            city: r.city ?? "Hamburg",
            district: r.district,
            website: r.website,
            phone: r.phone,
            email: r.email,
            companySize: r.companySize,
            notes: r.notes,
            tags: [...r.tags, ...(opts.tag ? [opts.tag] : [])],
            source: "csv",
            status: "new",
          },
          actorId,
        );
        companyId = c.id;
        summary.created++;
      }
      if (r.contact) {
        const existing = r.contact.email ? await findContactByEmail(r.contact.email) : null;
        const contact =
          existing ??
          (await createContact(
            {
              companyId,
              salutation: r.contact.salutation,
              firstName: r.contact.firstName ?? "",
              lastName: r.contact.lastName ?? "",
              position: r.contact.position,
              email: r.contact.email,
              phone: r.contact.phone,
              source: "csv",
            },
            actorId,
          ));
        if (!existing) summary.contacts++;
        if (r.consent && contact.email) {
          await setPermission({
            email: contact.email,
            basis: r.consent.basis,
            contactId: contact.id,
            grantedAt: r.consent.date,
            doiConfirmedAt: r.consent.basis === "double_opt_in" ? r.consent.date : null,
            evidence: r.consent.evidence,
            source: "CSV-Import",
            reason: `Import Zeile ${r.line}`,
            actorId,
          });
          summary.consents++;
        }
      }
    } catch (err) {
      summary.errors.push({ line: r.line, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return summary;
}

/** Übernimmt einen Firmenfinder-Treffer. Die öffentliche E-Mail wird gespeichert, begründet aber KEINE Werbeerlaubnis. */
export async function importFinderResult(r: FinderResult, actorId: string) {
  const dupes = await findCompanyDuplicates({ name: r.name, website: r.website, email: r.email, phone: r.phone, postalCode: r.postalCode, source: r.source, sourceRef: r.sourceRef });
  if (dupes[0] && dupes[0].score >= 0.9) {
    await db.update(schema.companies).set({ lastVerifiedAt: new Date() }).where(eq(schema.companies.id, dupes[0].id));
    return { status: "duplicate" as const, id: dupes[0].id };
  }
  const c = await createCompany(
    {
      name: r.name,
      industry: r.industry,
      street: r.street,
      postalCode: r.postalCode,
      city: r.city ?? "Hamburg",
      district: r.district,
      website: r.website,
      phone: r.phone,
      email: normalizeEmail(r.email),
      source: r.source,
      sourceRef: r.sourceRef,
      lat: r.lat,
      lon: r.lon,
      status: "new",
    },
    actorId,
  );
  await logActivity({ type: "import", title: "Aus Firmenfinder übernommen", body: `Quelle: OpenStreetMap (${r.sourceRef}) – © OpenStreetMap-Mitwirkende, ODbL`, companyId: c.id, userId: actorId });
  return { status: "created" as const, id: c.id };
}
