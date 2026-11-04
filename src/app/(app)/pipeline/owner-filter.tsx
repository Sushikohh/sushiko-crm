"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/primitives";

export function OwnerFilter({ owners, value }: { owners: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <NativeSelect className="h-8 w-auto text-xs" value={value} onChange={(e) => router.replace(e.target.value ? `/pipeline?owner=${e.target.value}` : "/pipeline")} aria-label="Mitarbeiter">
      <option value="">Alle Mitarbeiter</option>
      {owners.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </NativeSelect>
  );
}
