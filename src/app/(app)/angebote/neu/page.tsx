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
          title: companyName ? `Unterhaltsreinigung ${companyName}` : "",
          companyId: company ?? "",
          contactId: "",
          dealId: deal ?? deals.find((d) => d.companyId === company)?.id ?? "",
          items: [{ description: "Unterhaltsreinigung Büro- und Sozialräume", areaSqm: "", frequency: "5× wöchentlich", unit: "monthly", quantity: "1", unitPrice: "" }],
          vatRate: "19",
          validUntil,
          introText: `vielen Dank für das freundliche Gespräch und die Möglichkeit zur Besichtigung. Gern unterbreiten wir Ihnen folgendes Angebot.`,
          terms: DEFAULT_TERMS,
        }}
      />
    </>
  );
}
