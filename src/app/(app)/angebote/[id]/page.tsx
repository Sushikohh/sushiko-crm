import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, notInArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/db";
import type { OfferItem } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { OFFER_STATUS } from "@/lib/constants";
import { companyOptions, contactOptions } from "@/lib/services/details";
import { getSetting } from "@/lib/services/settings";
import { contactName, fmt } from "@/lib/utils";
import { Badge, Card } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { ComposeDialog } from "@/components/forms/compose-dialog";
import { OfferEditor } from "../offer-editor";
import { OfferActions } from "./offer-actions";

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o] = await db.select().from(schema.offers).where(eq(schema.offers.id, id));
  if (!o) notFound();
  const [[company], contact, identity, companies, contacts, deals, catalog] = await Promise.all([
    db.select().from(schema.companies).where(eq(schema.companies.id, o.companyId)),
    o.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, o.contactId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    getSetting("sender_identity"),
    companyOptions(),
    contactOptions(),
    db.select({ id: schema.deals.id, name: schema.deals.title, companyId: schema.deals.companyId }).from(schema.deals).where(notInArray(schema.deals.stage, ["lost"])),
    getSetting("catalog"),
  ]);
  const items = (o.items ?? []) as OfferItem[];
  const vat = Number(o.vatRate) / 100;
  const monthly = Number(o.monthlyNet);
  const oneTime = Number(o.oneTimeNet);

  return (
    <>
      <Link href="/angebote" className="no-print mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Angebote
      </Link>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{o.number}</h1>
          <Badge tone={o.status === "accepted" ? "green" : o.status === "rejected" ? "red" : o.status === "sent" ? "blue" : "slate"}>{OFFER_STATUS[o.status]}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {contact?.email ? (
            <ComposeDialog
              to={contact.email}
              contactId={contact.id}
              companyId={company?.id}
              subject={`Angebot ${o.number}: ${o.title}`}
              body={`Guten Tag ${contactName(contact)},\n\nwie besprochen erhalten Sie unser Angebot ${o.number} „${o.title}“:\n\n${o.eventDate ? `Termin: ${fmt.dateTime(o.eventDate)}\n` : ""}${o.guestCount ? `Personen: ${o.guestCount}\n` : ""}\n${items.map((it, i) => `${i + 1}. ${it.quantity} × ${it.description}${it.frequency ? ` (${it.frequency})` : ""}: ${fmt.eur2(it.quantity * it.unitPrice)}${it.unit === "monthly" ? " mtl." : ""}`).join("\n")}\n\n${oneTime ? `Gesamt Event: ${fmt.eur2(oneTime)} netto zzgl. ${Number(o.vatRate)} % USt.` : ""}${monthly ? `\nAbo monatlich: ${fmt.eur2(monthly)} netto zzgl. ${Number(o.vatRate)} % USt.` : ""}${o.validUntil ? `\nGültig bis: ${fmt.date(o.validUntil)}` : ""}\n\nBei Fragen melden Sie sich jederzeit.`}
            />
          ) : null}
          <OfferActions id={o.id} status={o.status} />
        </div>
      </div>

      <Tabs defaultValue="preview">
        <TabsList className="no-print">
          <TabsTrigger value="preview">Ansicht</TabsTrigger>
          {o.status === "draft" || o.status === "sent" ? <TabsTrigger value="edit">Bearbeiten</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="preview">
          <Card className="mx-auto max-w-3xl p-10 print:border-0 print:shadow-none">
            <div className="mb-10 flex justify-between gap-6 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground">
                  {identity ? `${identity.companyName} · ${identity.street} · ${identity.postalCode} ${identity.city}` : "Absenderangaben in den Einstellungen hinterlegen"}
                </p>
                <p className="mt-2 font-medium">{company?.name}</p>
                {contact ? <p>{`${contact.salutation ?? ""} ${contactName(contact)}`.trim()}</p> : null}
                <p>{company?.street}</p>
                <p>{[company?.postalCode, company?.city].filter(Boolean).join(" ")}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{identity?.companyName}</p>
                <p className="text-xs text-muted-foreground">{identity?.phone}</p>
                <p className="text-xs text-muted-foreground">{identity?.email}</p>
                <p className="mt-4 text-xs">
                  Angebotsnr.: <b>{o.number}</b>
                </p>
                <p className="text-xs">Datum: {fmt.date(o.createdAt)}</p>
                {o.validUntil ? <p className="text-xs">Gültig bis: {fmt.date(o.validUntil)}</p> : null}
              </div>
            </div>
            <h2 className="mb-3 text-lg font-semibold">Angebot: {o.title}</h2>
            {o.eventDate || o.guestCount || o.deliveryAddress || o.dietaryNotes ? (
              <dl className="mb-5 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                {o.eventDate ? (
                  <>
                    <dt className="text-muted-foreground">Termin / Lieferung</dt>
                    <dd>{fmt.dateTime(o.eventDate)} Uhr</dd>
                  </>
                ) : null}
                {o.guestCount ? (
                  <>
                    <dt className="text-muted-foreground">Personen</dt>
                    <dd>{fmt.num(o.guestCount)}</dd>
                  </>
                ) : null}
                {o.deliveryAddress ? (
                  <>
                    <dt className="text-muted-foreground">Lieferadresse</dt>
                    <dd>{o.deliveryAddress}</dd>
                  </>
                ) : null}
                {o.dietaryNotes ? (
                  <>
                    <dt className="text-muted-foreground">Hinweise</dt>
                    <dd>{o.dietaryNotes}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            <p className="mb-2 text-sm">{contact ? `Sehr geehrte${contact.salutation === "Herr" ? "r Herr" : contact.salutation === "Frau" ? " Frau" : ""} ${contact.salutation === "Herr" || contact.salutation === "Frau" ? contact.lastName : "Damen und Herren"},` : "Sehr geehrte Damen und Herren,"}</p>
            {o.introText ? <p className="mb-6 text-sm whitespace-pre-wrap">{o.introText}</p> : null}
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">Pos.</th>
                  <th className="py-2">Leistung</th>
                  <th className="py-2">Einheit</th>
                  <th className="py-2 text-right">Menge</th>
                  <th className="py-2 text-right">Einzelpreis</th>
                  <th className="py-2 text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="py-2">{i + 1}</td>
                    <td className="py-2">
                      {it.description}
                      {it.persons ? <span className="block text-xs text-muted-foreground">für {fmt.num(it.persons)} Personen</span> : null}
                    </td>
                    <td className="py-2 text-xs">
                      {it.frequency}
                      <span className="block text-muted-foreground">{it.unit === "monthly" ? "monatlich (Abo)" : "pro Event"}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt.num(it.quantity)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt.eur2(it.unitPrice)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt.eur2(it.quantity * it.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto grid max-w-xs gap-1 text-sm">
              {oneTime || !monthly ? (
                <>
                  <div className="flex justify-between">
                    <span>Summe netto</span>
                    <span className="tabular-nums">{fmt.eur2(oneTime)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>zzgl. {Number(o.vatRate)} % USt.</span>
                    <span className="tabular-nums">{fmt.eur2(oneTime * vat)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Gesamt brutto</span>
                    <span className="tabular-nums">{fmt.eur2(oneTime * (1 + vat))}</span>
                  </div>
                  {o.guestCount ? (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>entspricht pro Person (netto)</span>
                      <span className="tabular-nums">{fmt.eur2(oneTime / o.guestCount)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {monthly ? (
                <>
                  <div className="mt-2 flex justify-between">
                    <span>Abo monatlich netto</span>
                    <span className="tabular-nums">{fmt.eur2(monthly)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Abo monatlich brutto</span>
                    <span className="tabular-nums">{fmt.eur2(monthly * (1 + vat))}</span>
                  </div>
                </>
              ) : null}
            </div>
            {o.terms ? <p className="mt-8 text-xs whitespace-pre-wrap text-muted-foreground">{o.terms}</p> : null}
            {identity ? (
              <p className="mt-10 border-t pt-3 text-[10px] text-muted-foreground">
                {identity.companyName} {identity.legalForm} · {identity.street}, {identity.postalCode} {identity.city}
                {identity.managingDirector ? ` · ${/gbr/i.test(identity.legalForm ?? "") ? "Gesellschafter" : "Geschäftsführung"}: ${identity.managingDirector}` : ""}
                {identity.registerInfo ? ` · ${identity.registerInfo}` : ""}
                {identity.vatId ? ` · USt-IdNr. ${identity.vatId}` : ""}
                {identity.taxNumber ? ` · St.-Nr. ${identity.taxNumber}` : ""}
              </p>
            ) : null}
          </Card>
        </TabsContent>
        <TabsContent value="edit">
          <OfferEditor
            companies={companies}
            contacts={contacts}
            deals={deals}
            catalog={catalog!}
            initial={{
              id: o.id,
              title: o.title,
              companyId: o.companyId,
              contactId: o.contactId ?? "",
              dealId: o.dealId ?? "",
              items: items.map((i) => ({ description: i.description, persons: i.persons?.toString() ?? "", frequency: i.frequency, unit: i.unit, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })),
              vatRate: String(Number(o.vatRate)),
              validUntil: o.validUntil ?? "",
              eventDate: o.eventDate ? new Date(o.eventDate.getTime() - o.eventDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "",
              guestCount: o.guestCount?.toString() ?? "",
              deliveryAddress: o.deliveryAddress ?? "",
              dietaryNotes: o.dietaryNotes ?? "",
              introText: o.introText ?? "",
              terms: o.terms ?? "",
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
