"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { addLocationAction, deleteLocationAction } from "@/server/actions/companies";

type Loc = { id: string; label: string; street: string | null; postalCode: string | null; city: string | null; district: string | null; areaSqm: number | null };

export function LocationsCard({ companyId, main, locations }: { companyId: string; main: { street: string | null; postalCode: string | null; city: string | null; district: string | null }; locations: Loc[] }) {
  const [v, setV] = React.useState({ label: "", street: "", postalCode: "", city: "Hamburg", district: "", areaSqm: "" });
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const line = (l: { street: string | null; postalCode: string | null; city: string | null; district: string | null }) =>
    [l.street, [l.postalCode, l.city].filter(Boolean).join(" "), l.district].filter(Boolean).join(", ") || "Keine Adresse";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Standorte</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <MapPin className="size-4 text-brand" />
          <div>
            <p className="font-medium">Hauptsitz</p>
            <p className="text-xs text-muted-foreground">{line(main)}</p>
          </div>
        </div>
        {locations.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">
                {line(l)}
                {l.areaSqm ? ` · ${l.areaSqm.toLocaleString("de-DE")} m²` : ""}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Standort entfernen"
              onClick={() =>
                start(async () => {
                  await deleteLocationAction(l.id, companyId);
                  router.refresh();
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <form
          className="mt-2 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addLocationAction(companyId, { ...v, areaSqm: v.areaSqm ? Number(v.areaSqm) : null });
              if (r.ok) {
                setV({ label: "", street: "", postalCode: "", city: "Hamburg", district: "", areaSqm: "" });
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <Input className="sm:col-span-2" placeholder="Bezeichnung (z. B. Filiale Altona)" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} required />
          <Input className="sm:col-span-2" placeholder="Straße" value={v.street} onChange={(e) => setV({ ...v, street: e.target.value })} />
          <Input placeholder="PLZ" value={v.postalCode} onChange={(e) => setV({ ...v, postalCode: e.target.value })} />
          <Input placeholder="m²" value={v.areaSqm} onChange={(e) => setV({ ...v, areaSqm: e.target.value })} inputMode="numeric" />
          <Input className="sm:col-span-2" placeholder="Stadtteil" value={v.district} onChange={(e) => setV({ ...v, district: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Ort" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
          <Button type="submit" size="sm" variant="outline" className="sm:col-span-2" disabled={pending}>
            <Plus /> Standort hinzufügen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
