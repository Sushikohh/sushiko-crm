"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlay";
import { Field, Input } from "@/components/ui/primitives";
import { DEAL_STAGES, DEAL_STAGE_KEYS, type DealStageKey } from "@/lib/constants";
import { cn, fmt } from "@/lib/utils";
import { deleteDealAction, moveDealAction } from "@/server/actions/sales";

export type BoardDeal = {
  id: string;
  title: string;
  stage: DealStageKey;
  monthlyValue: number;
  probability: number;
  companyId: string;
  companyName: string;
  ownerName: string | null;
  expectedCloseDate: string | null;
  updatedAt: string;
};

export function PipelineBoard({ deals: initial, highlight }: { deals: BoardDeal[]; highlight?: string }) {
  // Optimistische Phasenwechsel bis zur Bestätigung durch den Server
  const [overrides, setOverrides] = React.useState<Record<string, DealStageKey>>({});
  const deals = React.useMemo(() => initial.map((d) => (overrides[d.id] && overrides[d.id] !== d.stage ? { ...d, stage: overrides[d.id], probability: DEAL_STAGES[overrides[d.id]].probability } : d)), [initial, overrides]);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<DealStageKey | null>(null);
  const [lost, setLost] = React.useState<{ id: string; reason: string } | null>(null);
  const router = useRouter();
  const move = async (id: string, stage: DealStageKey, reason?: string) => {
    setOverrides((o) => ({ ...o, [id]: stage }));
    const r = await moveDealAction(id, stage, reason);
    if (!r.ok) {
      setOverrides((o) => {
        const n = { ...o };
        delete n[id];
        return n;
      });
      toast.error(r.error);
    } else {
      if (stage === "won") toast.success("Deal gewonnen – Angebot als angenommen markieren, damit der Auftrag erfasst wird.");
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {DEAL_STAGE_KEYS.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          const sum = col.reduce((s, d) => s + d.monthlyValue, 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const d = deals.find((x) => x.id === id);
                if (!d || d.stage === stage) return;
                if (stage === "lost") setLost({ id, reason: "" });
                else void move(id, stage);
              }}
              className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors", over === stage && "border-brand bg-brand/5")}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold">{DEAL_STAGES[stage].label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {col.length} · {fmt.eur(sum)}/Monat
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">{DEAL_STAGES[stage].probability} %</span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {col.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", d.id);
                      setDragId(d.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "group cursor-grab rounded-lg border bg-card p-3 shadow-xs transition active:cursor-grabbing",
                      dragId === d.id && "opacity-50",
                      highlight === d.id && "ring-2 ring-brand",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/unternehmen/${d.companyId}`} className="text-sm font-medium hover:underline">
                        {d.companyName}
                      </Link>
                      <button
                        className="opacity-0 group-hover:opacity-100"
                        aria-label="Deal löschen"
                        onClick={async () => {
                          if (!confirm("Deal löschen?")) return;
                          await deleteDealAction(d.id);
                          router.refresh();
                        }}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.title}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-medium tabular-nums">{fmt.eur(d.monthlyValue)}/Mon.</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {d.expectedCloseDate ? (
                          <span className="inline-flex items-center gap-0.5">
                            <CalendarDays className="size-3" />
                            {fmt.date(d.expectedCloseDate)}
                          </span>
                        ) : null}
                        {d.ownerName ? (
                          <span className="inline-flex items-center gap-0.5" title={d.ownerName}>
                            <UserRound className="size-3" />
                            {d.ownerName.split(" ")[0]}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <select
                      className="mt-2 w-full rounded border bg-transparent px-1 py-0.5 text-[11px] text-muted-foreground md:hidden"
                      value={d.stage}
                      onChange={(e) => {
                        const s = e.target.value as DealStageKey;
                        if (s === "lost") setLost({ id: d.id, reason: "" });
                        else void move(d.id, s);
                      }}
                      aria-label="Phase"
                    >
                      {DEAL_STAGE_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {DEAL_STAGES[k].label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={!!lost} onOpenChange={(o) => !o && setLost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deal als verloren markieren</DialogTitle>
          </DialogHeader>
          <Field label="Grund (für spätere Auswertung)">
            <Input value={lost?.reason ?? ""} onChange={(e) => setLost((l) => (l ? { ...l, reason: e.target.value } : l))} placeholder="z. B. Preis, Bestandsdienstleister, kein Bedarf" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLost(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (lost) void move(lost.id, "lost", lost.reason);
                setLost(null);
              }}
            >
              Als verloren markieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
