"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { DEFAULT_CATALOG, PIECES_PER_GUEST, netFromGross, type CatalogItem } from "@/lib/business/sushiko";
import { fmt } from "@/lib/utils";
import { saveCatalogAction } from "@/server/actions/settings";

type Catalog = { items: CatalogItem[]; buffetPricePerPieceNet: number | null; setupFeeNet: number | null };
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function CatalogPanel({ initial, readOnly }: { initial: Catalog; readOnly: boolean }) {
  const [items, setItems] = React.useState(initial.items);
  const [ppp, setPpp] = React.useState(initial.buffetPricePerPieceNet?.toString() ?? "");
  const [fee, setFee] = React.useState(initial.setupFeeNet?.toString() ?? "");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const set = (i: number, patch: Partial<CatalogItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const pricePerPiece = num(ppp);

  const save = () =>
    start(async () => {
      const r = await saveCatalogAction({ items, buffetPricePerPieceNet: pricePerPiece, setupFeeNet: num(fee) });
      if (r.ok) {
        toast.success("Katalog gespeichert");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Buffet-Kalkulation</CardTitle>
          <CardDescription>
            Auf catering.sushiko-hh.de stehen keine Preise – jedes Catering wird individuell kalkuliert. Hinterlegen Sie hier Ihren Preis pro Stück, dann rechnet der Buffet-Rechner im Angebot automatisch.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Buffet-Preis pro Stück (€ netto)" hint="z. B. Mischkalkulation über Maki, Inside-Out, Nigiri">
              <Input value={ppp} onChange={(e) => setPpp(e.target.value)} inputMode="decimal" placeholder="nicht festgelegt" disabled={readOnly} />
            </Field>
            <Field label="Pauschale Lieferung & Aufbau (€ netto, optional)" hint="Leer lassen, wenn im Stückpreis enthalten.">
              <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="keine" disabled={readOnly} />
            </Field>
          </div>
          <div className="rounded-lg border p-3 text-xs">
            <p className="mb-1.5 font-medium">Stück pro Gast (laut Ihrer Catering-Seite)</p>
            <div className="grid gap-1 sm:grid-cols-3">
              {Object.values(PIECES_PER_GUEST).map((p) => (
                <p key={p.label} className="text-muted-foreground">
                  {p.label}: <b className="text-foreground">{p.min}–{p.max} Stück</b>
                  {pricePerPiece ? <span className="block">≈ {fmt.eur2(p.min * pricePerPiece)}–{fmt.eur2(p.max * pricePerPiece)} netto pro Gast</span> : null}
                </p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle>Menüs & Platten</CardTitle>
            <CardDescription>Vorbelegt mit den Sushi-Menüs Ihrer Speisekarte (Listenpreis brutto inkl. 7 % USt., ohne Online-Rabatt). Im Angebot wird automatisch der Nettopreis eingesetzt.</CardDescription>
          </div>
          {!readOnly ? (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setItems(DEFAULT_CATALOG)} title="Auf Speisekarte zurücksetzen">
                <RotateCcw /> Speisekarte
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setItems((xs) => [...xs, { id: `eigen-${Date.now()}`, name: "", description: "", pieces: null, priceGross: null, allergens: "", category: "buffet", source: "manuell" }])}
              >
                <Plus /> Position
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-2">
          {items.length === 0 ? <Callout tone="amber">Keine Katalogpositionen.</Callout> : null}
          {items.map((it, i) => (
            <div key={it.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.3fr_2fr_80px_110px_110px_32px] sm:items-start">
              <div className="grid gap-1">
                <Input value={it.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" aria-label="Name" disabled={readOnly} />
                <NativeSelect value={it.category} onChange={(e) => set(i, { category: e.target.value as CatalogItem["category"] })} className="h-8 text-xs" aria-label="Kategorie" disabled={readOnly}>
                  <option value="menu">Menü (Speisekarte)</option>
                  <option value="buffet">Buffet / Catering</option>
                  <option value="extra">Extra</option>
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Input value={it.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Inhalt" aria-label="Inhalt" disabled={readOnly} />
                <Input value={it.allergens} onChange={(e) => set(i, { allergens: e.target.value })} placeholder="Allergene" aria-label="Allergene" className="h-8 text-xs" disabled={readOnly} />
              </div>
              <Input value={it.pieces?.toString() ?? ""} onChange={(e) => set(i, { pieces: num(e.target.value) })} placeholder="Stk." aria-label="Stück" inputMode="numeric" disabled={readOnly} />
              <div className="grid gap-0.5">
                <Input value={it.priceGross?.toString() ?? ""} onChange={(e) => set(i, { priceGross: num(e.target.value) })} placeholder="€ brutto" aria-label="Preis brutto" inputMode="decimal" disabled={readOnly} />
                {it.priceGross ? <span className="text-[11px] text-muted-foreground">{fmt.eur2(netFromGross(it.priceGross))} netto</span> : null}
              </div>
              <span className="text-[11px] text-muted-foreground sm:pt-2">{it.pieces && it.priceGross ? `${fmt.eur2(it.priceGross / it.pieces)} / Stk. brutto` : ""}</span>
              {!readOnly ? (
                <Button size="icon-sm" variant="ghost" aria-label="Entfernen" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
      {!readOnly ? (
        <Button className="w-fit" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" /> : null} Katalog speichern
        </Button>
      ) : null}
    </div>
  );
}
