"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { NativeSelect, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ACQ_STATUS, INDUSTRIES } from "@/lib/constants";

export function AnalyticsFilterBar({ campaigns, owners }: { campaigns: { id: string; name: string }[]; owners: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const range = sp.get("range") ?? "90d";
  const active = ["industry", "campaign", "owner", "status"].some((k) => sp.get(k)) || range !== "90d";
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <NativeSelect className="h-8 w-auto text-xs" value={range} onChange={(e) => set("range", e.target.value)} aria-label="Zeitraum">
        <option value="30d">Letzte 30 Tage</option>
        <option value="90d">Letzte 90 Tage</option>
        <option value="180d">Letzte 6 Monate</option>
        <option value="365d">Letzte 12 Monate</option>
        <option value="ytd">Dieses Jahr</option>
        <option value="all">Gesamter Zeitraum</option>
        <option value="custom">Benutzerdefiniert …</option>
      </NativeSelect>
      {range === "custom" ? (
        <>
          <Input type="date" className="h-8 w-auto text-xs" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} aria-label="Von" />
          <Input type="date" className="h-8 w-auto text-xs" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} aria-label="Bis" />
        </>
      ) : null}
      <NativeSelect className="h-8 w-auto text-xs" value={sp.get("industry") ?? ""} onChange={(e) => set("industry", e.target.value)} aria-label="Branche">
        <option value="">Alle Branchen</option>
        {Object.entries(INDUSTRIES).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className="h-8 w-auto text-xs" value={sp.get("campaign") ?? ""} onChange={(e) => set("campaign", e.target.value)} aria-label="Kampagne">
        <option value="">Alle Kampagnen</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className="h-8 w-auto text-xs" value={sp.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)} aria-label="Mitarbeiter">
        <option value="">Alle Mitarbeiter</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className="h-8 w-auto text-xs" value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} aria-label="Kontaktstatus">
        <option value="">Alle Status</option>
        {Object.entries(ACQ_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </NativeSelect>
      {active ? (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
          <X /> Zurücksetzen
        </Button>
      ) : null}
    </div>
  );
}
