"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/primitives";

export function SearchBox({ initial }: { initial: string }) {
  const [q, setQ] = React.useState(initial);
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams(sp.toString());
        if (q) p.set("q", q);
        else p.delete("q");
        p.delete("m");
        router.push(`/postfach?${p.toString()}`);
      }}
    >
      <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="E-Mails durchsuchen" className="h-8 w-56 pl-8 text-sm" />
    </form>
  );
}
