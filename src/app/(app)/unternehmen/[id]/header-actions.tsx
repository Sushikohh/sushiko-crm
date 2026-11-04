"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { Input, Label, NativeSelect } from "@/components/ui/primitives";
import { ACQ_STATUS } from "@/lib/constants";
import { setFollowUpAction, setPotentialAction, updateCompanyAction } from "@/server/actions/companies";

export function StatusSelect({ companyId, status }: { companyId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <NativeSelect
      className="h-8 w-auto text-xs"
      value={status}
      disabled={pending}
      aria-label="Akquisestatus"
      onChange={(e) =>
        start(async () => {
          const r = await updateCompanyAction(companyId, { status: e.target.value as never });
          if (r.ok) {
            toast.success("Status geändert");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {Object.entries(ACQ_STATUS).map(([k, s]) => (
        <option key={k} value={k}>
          {s.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function FollowUpButton({ companyId, current }: { companyId: string; current: string | null }) {
  const router = useRouter();
  const [date, setDate] = React.useState(() => (current ? current.slice(0, 10) : new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)));
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarClock /> Wiedervorlage
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Datum</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>Notiz</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Vertrag läuft im März aus" />
        </div>
        <div className="flex justify-between gap-2">
          {current ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                start(async () => {
                  await setFollowUpAction(companyId, null);
                  router.refresh();
                })
              }
            >
              Entfernen
            </Button>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setFollowUpAction(companyId, `${date}T09:00:00`, note);
                if (r.ok) {
                  toast.success("Wiedervorlage gesetzt");
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Speichern
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PotentialEditor({ companyId, score, override, factors }: { companyId: string; score: number; override: boolean; factors: { label: string; points: number }[] }) {
  const router = useRouter();
  const [val, setVal] = React.useState(String(score));
  const [pending, start] = React.useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Gauge className="size-3.5" /> Potenzial {score}
          {override ? " (manuell)" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent className="grid gap-3">
        <div>
          <p className="text-sm font-medium">Berechnung</p>
          <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
            {factors.map((f) => (
              <li key={f.label} className="flex justify-between">
                <span>{f.label}</span>
                <span className="tabular-nums">+{f.points}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label>Manuell festlegen (0–100)</Label>
            <Input type="number" min={0} max={100} value={val} onChange={(e) => setVal(e.target.value)} />
          </div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setPotentialAction(companyId, Number(val));
                router.refresh();
              })
            }
          >
            Setzen
          </Button>
        </div>
        {override ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              start(async () => {
                await setPotentialAction(companyId, null);
                router.refresh();
              })
            }
          >
            Automatisch berechnen
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
