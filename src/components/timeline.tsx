"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Building2, Calendar, CheckSquare, FileSignature, FileText, GitMerge, KanbanSquare, Phone, RefreshCw, ShieldAlert, StickyNote, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/primitives";
import { ACQ_STATUS, type AcqStatus } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { addNoteAction } from "@/server/actions/companies";

export type TimelineItem = { id: string; type: string; title: string; body: string | null; userName: string | null; createdAt: string; meta: unknown };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: Phone,
  email_out: ArrowUpRight,
  email_in: ArrowDownLeft,
  status_change: RefreshCw,
  permission_change: ShieldAlert,
  meeting: Calendar,
  task: CheckSquare,
  offer: FileText,
  contract: FileSignature,
  deal: KanbanSquare,
  import: Upload,
  merge: GitMerge,
  system: Building2,
};

export function NoteComposer({ companyId, contactId }: { companyId?: string | null; contactId?: string | null }) {
  const [body, setBody] = React.useState("");
  const [type, setType] = React.useState<"note" | "call" | "meeting">("note");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <form
      className="grid gap-2 rounded-lg border bg-muted/20 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addNoteAction({ companyId, contactId, type, body });
          if (r.ok) {
            setBody("");
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Notiz, Gesprächsprotokoll oder Telefonnotiz …" className="bg-background" />
      <div className="flex items-center justify-between">
        <NativeSelect value={type} onChange={(e) => setType(e.target.value as typeof type)} className="h-8 w-auto text-xs">
          <option value="note">Notiz</option>
          <option value="call">Telefonat</option>
          <option value="meeting">Gespräch vor Ort</option>
        </NativeSelect>
        <Button size="sm" type="submit" disabled={pending || !body.trim()}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">Noch keine Aktivitäten.</p>;
  return (
    <ol className="relative grid gap-4 pl-6 before:absolute before:top-1 before:bottom-1 before:left-[9px] before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = ICONS[a.type] ?? StickyNote;
        const meta = (a.meta ?? {}) as { from?: AcqStatus; to?: AcqStatus };
        return (
          <li key={a.id} className="relative">
            <span className="absolute top-0.5 -left-6 flex size-[19px] items-center justify-center rounded-full border bg-background">
              <Icon className="size-2.5 text-muted-foreground" />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{a.title}</p>
              <time className="text-[11px] text-muted-foreground" title={fmt.dateTime(a.createdAt)} suppressHydrationWarning>
                {fmt.relative(a.createdAt)}
                {a.userName ? ` · ${a.userName}` : ""}
              </time>
            </div>
            {a.type === "status_change" && meta.from && meta.to ? (
              <p className="text-xs text-muted-foreground">
                {ACQ_STATUS[meta.from]?.label} → {ACQ_STATUS[meta.to]?.label}
              </p>
            ) : null}
            {a.body ? <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
