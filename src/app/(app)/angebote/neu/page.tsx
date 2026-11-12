import { notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { companyOptions, contactOptions } from "@/lib/services/details";
import { PageHeader } from "@/components/ui/primitives";
import { requestTime } from "@/lib/utils";
import { DEFAULT_TERMS, OfferEditor } from "../offer-editor";

export const metadata = { title: "Neues Angebot" };

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ company?: string; deal?: string }> }) {
  await requireUser();
  const { company, deal } = await searchParams;
  const [companies, contacts, deals] = await Promise.all([
    companyOptions(),
    contactOptions(),
    db.select({ id: schema.deals.id, name: schema.deals.title, companyId: schema.deals.companyId }).from(schema.deals).where(notInArray(schema.deals.stage, ["won", "lost"])),
  ]);
  const validUntil = new Date(requestTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const companyName = companies.find((c) => c.id === company)?.name;
  return (
    <>
      <PageHeader title="Neues Angebot" description="Leistungspositionen erfassen – Summen werden automatisch berechnet." />
      <OfferEditor
        companies={companies}
        contacts={contacts}
        deals={deals}
        initial={{
          title: companyName ? `Sushi-Catering ${companyName}` : "Sushi-Catering",
          companyId: company ?? "",
          contactId: "",
          dealId: deal ?? deals.find((d) => d.companyId === company)?.id ?? "",
          // Preise bewusst leer: Ihre Preisliste in den Positionen eintragen
          items: [
            { description: "Sushi-Mix-Platte (Maki, Inside-Out, Nigiri)", persons: "", frequency: "Platte", unit: "one_time", quantity: "1", unitPrice: "" },
            { description: "Vegetarische / vegane Platte", persons: "", frequency: "Platte", unit: "one_time", quantity: "1", unitPrice: "" },
            { description: "Lieferung inkl. Sojasauce, Wasabi, Ingwer, Stäbchen", persons: "", frequency: "pauschal", unit: "one_time", quantity: "1", unitPrice: "" },
          ],
          vatRate: "7",
          eventDate: "",
          guestCount: "",
          deliveryAddress: "",
          dietaryNotes: "",
          validUntil,
          introText: `vielen Dank für Ihre Anfrage. Gern unterbreiten wir Ihnen folgendes Angebot für Ihr Sushi-Catering.`,
          terms: DEFAULT_TERMS,
        }}
      />
    </>
  );
}
