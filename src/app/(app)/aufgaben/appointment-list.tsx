"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { setAppointmentStatusAction } from "@/server/actions/sales";

export type ApptItem = { id: string; title: string; type: string; startsAt: string; endsAt: string | null; location: string | null; status: "planned" | "done" | "cancelled" | "no_show"; companyId: string | null; companyName: string | null; contactName: string | null; notes: string | null };

const TYPE: Record<string, string> = { tasting: "Verkostung", meeting: "Gespräch", call: "Telefontermin", delivery: "Event / Lieferung" };
const STATUS = { planned: { l: "Geplant", t: "blue" }, done: { l: "Durchgeführt", t: "green" }, cancelled: { l: "Abgesagt", t: "slate" }, no_show: { l: "Nicht erschienen", t: "amber" } } as const;

export function AppointmentList({ items }: { items: ApptItem[] }) {
  const router = useRouter();
  const [, start] = React.useTransition();
  if (!items.length) return <Card className="p-6 text-center text-sm text-muted-foreground">Keine Termine.</Card>;
  // Gruppierung nach Tag
  const groups = new Map<string, ApptItem[]>();
  for (const a of items) {
    const key = new Date(a.startsAt).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const set = (id: string, status: ApptItem["status"]) =>
    start(async () => {
      let outcome: string | undefined;
      if (status === "done") outcome = window.prompt("Ergebnis des Termins (optional):") ?? undefined;
      const r = await setAppointmentStatusAction(id, status, outcome);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="grid gap-4">
      {[...groups.entries()].map(([day, list]) => (
        <div key={day}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day}</p>
          <Card className="divide-y">
            {list.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="w-24 shrink-0 text-sm tabular-nums">
                  {new Date(a.startsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  {a.endsAt ? <span className="text-muted-foreground">–{new Date(a.endsAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", a.status === "cancelled" && "line-through text-muted-foreground")}>{a.title}</p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{TYPE[a.type] ?? a.type}</span>
                    {a.companyId ? (
                      <Link href={`/unternehmen/${a.companyId}`} className="hover:underline">
                        {a.companyName}
                      </Link>
                    ) : null}
                    {a.contactName ? <span>{a.contactName}</span> : null}
                    {a.location ? (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="size-3" />
                        {a.location}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Badge tone={STATUS[a.status].t}>{STATUS[a.status].l}</Badge>
                {a.status === "planned" ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => set(a.id, "done")}>
                      <Check /> Erledigt
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Absagen" onClick={() => set(a.id, "cancelled")}>
                      <X />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
