import { notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { companyOptions, contactOptions } from "@/lib/services/details";
import { PageHeader } from "@/components/ui/primitives";
import { requestTime } from "@/lib/utils";
import { DEFAULT_TERMS, OfferEditor } from "../offer-editor";
import { DEFAULT_OFFER_INTRO } from "@/lib/business/sushiko";
import { getSetting } from "@/lib/services/settings";

export const metadata = { title: "Neues Angebot" };

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ company?: string; deal?: string }> }) {
  await requireUser();
  const { company, deal } = await searchParams;
  const [companies, contacts, deals, catalog] = await Promise.all([
    companyOptions(),
    contactOptions(),
    db.select({ id: schema.deals.id, name: schema.deals.title, companyId: schema.deals.companyId }).from(schema.deals).where(notInArray(schema.deals.stage, ["won", "lost"])),
    getSetting("catalog"),
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
        catalog={catalog!}
        initial={{
          title: companyName ? `Sushi-Catering ${companyName}` : "Sushi-Catering",
          companyId: company ?? "",
          contactId: "",
          dealId: deal ?? deals.find((d) => d.companyId === company)?.id ?? "",
          items: [{ description: "", persons: "", frequency: "", unit: "one_time", quantity: "1", unitPrice: "" }],
          vatRate: "7",
          eventDate: "",
          guestCount: "",
          deliveryAddress: "",
          dietaryNotes: "",
          validUntil,
          introText: DEFAULT_OFFER_INTRO,
          terms: DEFAULT_TERMS,
        }}
      />
    </>
  );
}
