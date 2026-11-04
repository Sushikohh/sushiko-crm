"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { fmt } from "@/lib/utils";
import { saveOfferAction } from "@/server/actions/sales";

type Item = { description: string; areaSqm: string; frequency: string; unit: "monthly" | "one_time"; quantity: string; unitPrice: string };
type Opt = { id: string; name: string };

export type OfferEditorValues = {
  id?: string;
  title: string;
  companyId: string;
  contactId: string;
  dealId: string;
  items: Item[];
  vatRate: string;
  validUntil: string;
  introText: string;
  terms: string;
};

export const DEFAULT_TERMS = `Alle Preise verstehen sich netto zzgl. gesetzlicher Umsatzsteuer.
Die Leistungen werden gemäß beigefügtem Leistungsverzeichnis erbracht. Reinigungsmittel und -geräte sind im Preis enthalten.
Vertragslaufzeit 12 Monate, danach monatlich kündbar mit einer Frist von 3 Monaten.
Dieses Angebot ist bis zum angegebenen Datum gültig.`;

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

export function OfferEditor({ initial, companies, contacts, deals }: { initial: OfferEditorValues; companies: Opt[]; contacts: (Opt & { companyId: string | null })[]; deals: (Opt & { companyId: string })[] }) {
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const setItem = (i: number, patch: Partial<Item>) => setV((s) => ({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const monthly = v.items.filter((i) => i.unit === "monthly").reduce((s, i) => s + num(i.quantity) * num(i.unitPrice), 0);
  const oneTime = v.items.filter((i) => i.unit === "one_time").reduce((s, i) => s + num(i.quantity) * num(i.unitPrice), 0);
  const vat = num(v.vatRate) / 100;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Angebot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Titel" className="sm:col-span-2">
            <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="z. B. Unterhaltsreinigung Büroflächen 2. OG" />
          </Field>
          <Field label="Unternehmen">
            <NativeSelect value={v.companyId} onChange={(e) => setV({ ...v, companyId: e.target.value, contactId: "", dealId: "" })}>
              <option value="">– wählen –</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Ansprechpartner">
            <NativeSelect value={v.contactId} onChange={(e) => setV({ ...v, contactId: e.target.value })}>
              <option value="">–</option>
              {contacts
                .filter((c) => c.companyId === v.companyId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Deal">
            <NativeSelect value={v.dealId} onChange={(e) => setV({ ...v, dealId: e.target.value })}>
              <option value="">–</option>
              {deals
                .filter((d) => d.companyId === v.companyId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gültig bis">
              <Input type="date" value={v.validUntil} onChange={(e) => setV({ ...v, validUntil: e.target.value })} />
            </Field>
            <Field label="USt. (%)">
              <Input value={v.vatRate} onChange={(e) => setV({ ...v, vatRate: e.target.value })} inputMode="decimal" />
            </Field>
          </div>
          <Field label="Einleitung" className="sm:col-span-2">
            <Textarea value={v.introText} onChange={(e) => setV({ ...v, introText: e.target.value })} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leistungspositionen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="hidden grid-cols-[1fr_80px_150px_120px_70px_100px_32px] gap-2 px-1 text-[11px] font-medium text-muted-foreground md:grid">
            <span>Leistung</span>
            <span>m²</span>
            <span>Turnus</span>
            <span>Abrechnung</span>
            <span>Menge</span>
            <span>Preis (€)</span>
            <span />
          </div>
          {v.items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-2 md:grid-cols-[1fr_80px_150px_120px_70px_100px_32px] md:border-0 md:p-0">
              <Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="z. B. Unterhaltsreinigung Büro" aria-label="Leistung" />
              <Input value={it.areaSqm} onChange={(e) => setItem(i, { areaSqm: e.target.value })} inputMode="numeric" aria-label="Fläche" />
              <Input value={it.frequency} onChange={(e) => setItem(i, { frequency: e.target.value })} placeholder="z. B. 5× wöchentlich" aria-label="Turnus" />
              <NativeSelect value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value as Item["unit"] })} aria-label="Abrechnung">
                <option value="monthly">monatlich</option>
                <option value="one_time">einmalig</option>
              </NativeSelect>
              <Input value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} inputMode="decimal" aria-label="Menge" />
              <Input value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} inputMode="decimal" aria-label="Preis" />
              <Button size="icon-sm" variant="ghost" aria-label="Position entfernen" onClick={() => setV({ ...v, items: v.items.filter((_, j) => j !== i) })} disabled={v.items.length === 1}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setV({ ...v, items: [...v.items, { description: "", areaSqm: "", frequency: "", unit: "monthly", quantity: "1", unitPrice: "" }] })}>
            <Plus /> Position
          </Button>
          <div className="mt-3 ml-auto grid w-full max-w-sm gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monatlich netto</span>
              <span className="tabular-nums">{fmt.eur2(monthly)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">zzgl. USt.</span>
              <span className="tabular-nums">{fmt.eur2(monthly * vat)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Monatlich brutto</span>
              <span className="tabular-nums">{fmt.eur2(monthly * (1 + vat))}</span>
            </div>
            {oneTime ? (
              <div className="mt-1 flex justify-between text-muted-foreground">
                <span>Einmalig netto</span>
                <span className="tabular-nums">{fmt.eur2(oneTime)}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konditionen</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={v.terms} onChange={(e) => setV({ ...v, terms: e.target.value })} rows={5} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveOfferAction(v.id ?? null, {
                title: v.title,
                companyId: v.companyId,
                contactId: v.contactId || null,
                dealId: v.dealId || null,
                items: v.items.map((i) => ({ description: i.description, areaSqm: i.areaSqm ? num(i.areaSqm) : null, frequency: i.frequency, unit: i.unit, quantity: num(i.quantity), unitPrice: num(i.unitPrice) })),
                vatRate: num(v.vatRate),
                validUntil: v.validUntil || null,
                introText: v.introText,
                terms: v.terms,
              });
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("Angebot gespeichert");
              router.push(`/angebote/${r.data}`);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Angebot speichern
        </Button>
      </div>
    </div>
  );
}
