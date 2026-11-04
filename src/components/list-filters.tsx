"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[] };

export function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return React.useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      if (!("page" in updates)) p.delete("page");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}

export function ListFilters({ filters, placeholder = "Suchen …" }: { filters: FilterDef[]; placeholder?: string }) {
  const sp = useSearchParams();
  const set = useSetParam();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
  }, [q, sp, set]);
  const active = filters.some((f) => sp.get(f.key)) || !!sp.get("q");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-8 pl-8 text-sm" aria-label="Suche" />
      </div>
      {filters.map((f) => (
        <NativeSelect key={f.key} className="h-8 w-auto text-xs" value={sp.get(f.key) ?? ""} onChange={(e) => set({ [f.key]: e.target.value || null })} aria-label={f.label}>
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            set(Object.fromEntries([...filters.map((f) => [f.key, null]), ["q", null]]));
          }}
        >
          <X /> Zurücksetzen
        </Button>
      ) : null}
    </div>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams(sp.toString());
    q.set("page", String(p));
    return `${pathname}?${q.toString()}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {total === 0 ? "Keine Einträge" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} von ${total.toLocaleString("de-DE")}`}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" asChild disabled={page <= 1}>
          <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
            <ChevronLeft />
          </Link>
        </Button>
        <span className="px-2">
          Seite {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
            <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function SortHeader({ field, label, current }: { field: string; label: string; current: string }) {
  const set = useSetParam();
  const [f, dir] = current.split(":");
  const active = f === field;
  return (
    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => set({ sort: `${field}:${active && dir === "asc" ? "desc" : "asc"}` })}>
      {label}
      {active ? <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}
