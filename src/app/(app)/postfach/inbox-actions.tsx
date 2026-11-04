"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, MailOpen, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { Input } from "@/components/ui/primitives";
import { assignMessageAction, cancelQueuedAction, markReadAction, reanalyzeAction, syncNowAction } from "@/server/actions/email";

function useAct() {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (msg ?? r.message) toast.success(msg ?? r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  return { pending, act };
}

export function SyncButton() {
  const { pending, act } = useAct();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => syncNowAction())}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Abrufen
    </Button>
  );
}

export function MarkRead({ id, read }: { id: string; read: boolean }) {
  const { act } = useAct();
  React.useEffect(() => {
    if (!read) void markReadAction([id], true);
  }, [id, read]);
  return (
    <Button size="sm" variant="ghost" onClick={() => act(() => markReadAction([id], false), "Als ungelesen markiert")}>
      <MailOpen /> Ungelesen
    </Button>
  );
}

export function Reanalyze({ id }: { id: string }) {
  const { pending, act } = useAct();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => reanalyzeAction(id))}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Neu analysieren
    </Button>
  );
}

export function CancelQueued({ id }: { id: string }) {
  const { pending, act } = useAct();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => cancelQueuedAction([id]))}>
      <XCircle /> Versand abbrechen
    </Button>
  );
}

export function AssignMessage({ id, contacts }: { id: string; contacts: { id: string; name: string; email: string | null; companyName: string | null }[] }) {
  const { pending, act } = useAct();
  const [q, setQ] = React.useState("");
  const hits = q.length < 2 ? [] : contacts.filter((c) => `${c.name} ${c.email ?? ""} ${c.companyName ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          <Link2 /> Zuordnen
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ansprechpartner suchen …" className="mb-2 h-8" />
        {hits.map((c) => (
          <button key={c.id} disabled={pending} onClick={() => act(() => assignMessageAction(id, c.id, null), "Zugeordnet")} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            <span className="font-medium">{c.name}</span>
            <span className="block text-xs text-muted-foreground">{[c.companyName, c.email].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
        {q.length >= 2 && !hits.length ? <p className="p-2 text-xs text-muted-foreground">Keine Treffer</p> : null}
      </PopoverContent>
    </Popover>
  );
}
