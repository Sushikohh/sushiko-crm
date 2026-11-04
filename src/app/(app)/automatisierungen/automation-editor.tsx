"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Switch } from "@/components/ui/overlay";
import { Field, Input, NativeSelect } from "@/components/ui/primitives";
import { ACQ_STATUS, DEAL_STAGES, REPLY_CATEGORIES, TASK_TYPES } from "@/lib/constants";
import { deleteAutomationAction, saveAutomationAction, toggleAutomationAction } from "@/server/actions/automations";

export type AutomationAction =
  | { type: "set_company_status"; status: string }
  | { type: "set_contact_status"; status: string }
  | { type: "create_task"; title: string; taskType: string; dueInDays: number; priority: string }
  | { type: "notify"; title: string }
  | { type: "ensure_deal"; stage: string }
  | { type: "set_follow_up"; days: number; useSuggestedDate: boolean };

export type AutomationValues = {
  id?: string;
  name: string;
  description: string;
  trigger: string;
  conditions: { categories?: string[]; toStage?: string[]; toStatus?: string[] };
  actions: AutomationAction[];
  enabled: boolean;
};

const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  set_company_status: "Akquisestatus setzen",
  set_contact_status: "Kontaktstatus setzen",
  create_task: "Aufgabe anlegen",
  notify: "Benachrichtigen",
  ensure_deal: "Deal anlegen / Phase setzen",
  set_follow_up: "Wiedervorlage setzen",
};

function newAction(type: AutomationAction["type"]): AutomationAction {
  switch (type) {
    case "set_company_status":
    case "set_contact_status":
      return { type, status: "interested" };
    case "create_task":
      return { type, title: "Nachfassen", taskType: "call", dueInDays: 1, priority: "normal" };
    case "notify":
      return { type, title: "Neue Aktivität" };
    case "ensure_deal":
      return { type, stage: "interested" };
    case "set_follow_up":
      return { type, days: 90, useSuggestedDate: true };
  }
}

function Multi({ options, value, onChange }: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(options).map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button type="button" key={k} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} className={`rounded-md border px-2 py-1 text-xs ${on ? "border-brand bg-brand/10" : "text-muted-foreground hover:bg-muted"}`}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function AutomationEditor({ initial, triggers, trigger }: { initial?: AutomationValues; triggers: Record<string, { label: string; description: string }>; trigger?: React.ReactNode }) {
  const empty: AutomationValues = { name: "", description: "", trigger: "reply.classified", conditions: { categories: ["interested"] }, actions: [newAction("create_task")], enabled: true };
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<AutomationValues>(initial ?? empty);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const setAct = (i: number, a: AutomationAction) => setV((s) => ({ ...s, actions: s.actions.map((x, j) => (j === i ? a : x)) }));
  const statusOpts = Object.fromEntries(Object.entries(ACQ_STATUS).map(([k, s]) => [k, s.label]));
  const stageOpts = Object.fromEntries(Object.entries(DEAL_STAGES).map(([k, s]) => [k, s.label]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial ?? empty);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Neue Regel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{v.id ? "Automatisierung bearbeiten" : "Neue Automatisierung"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Auslöser (Wenn …)">
              <NativeSelect value={v.trigger} onChange={(e) => setV({ ...v, trigger: e.target.value, conditions: {} })}>
                {Object.entries(triggers).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Beschreibung" className="sm:col-span-2">
              <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
            </Field>
          </div>
          {v.trigger === "reply.classified" ? (
            <Field label="… und die Antwort-Kategorie ist">
              <Multi options={Object.fromEntries(Object.entries(REPLY_CATEGORIES).map(([k, c]) => [k, c.label]))} value={v.conditions.categories ?? []} onChange={(categories) => setV({ ...v, conditions: { ...v.conditions, categories } })} />
            </Field>
          ) : null}
          {v.trigger === "deal.stage_changed" ? (
            <Field label="… und die neue Phase ist">
              <Multi options={stageOpts} value={v.conditions.toStage ?? []} onChange={(toStage) => setV({ ...v, conditions: { ...v.conditions, toStage } })} />
            </Field>
          ) : null}
          <div className="grid gap-2">
            <p className="text-sm font-medium">Dann …</p>
            {v.actions.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                <NativeSelect value={a.type} onChange={(e) => setAct(i, newAction(e.target.value as AutomationAction["type"]))}>
                  {Object.entries(ACTION_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex flex-wrap gap-2">
                  {a.type === "set_company_status" || a.type === "set_contact_status" ? (
                    <NativeSelect value={a.status} onChange={(e) => setAct(i, { ...a, status: e.target.value })}>
                      {Object.entries(statusOpts).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : null}
                  {a.type === "ensure_deal" ? (
                    <NativeSelect value={a.stage} onChange={(e) => setAct(i, { ...a, stage: e.target.value })}>
                      {Object.entries(stageOpts).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : null}
                  {a.type === "notify" ? <Input value={a.title} onChange={(e) => setAct(i, { ...a, title: e.target.value })} placeholder="Titel der Benachrichtigung" /> : null}
                  {a.type === "create_task" ? (
                    <>
                      <Input className="min-w-48 flex-1" value={a.title} onChange={(e) => setAct(i, { ...a, title: e.target.value })} placeholder="Titel" />
                      <NativeSelect className="w-auto" value={a.taskType} onChange={(e) => setAct(i, { ...a, taskType: e.target.value })}>
                        {Object.entries(TASK_TYPES).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input className="w-24" type="number" min={0} value={a.dueInDays} onChange={(e) => setAct(i, { ...a, dueInDays: Number(e.target.value) })} aria-label="Fällig in Tagen" title="Fällig in Tagen" />
                      <NativeSelect className="w-auto" value={a.priority} onChange={(e) => setAct(i, { ...a, priority: e.target.value })}>
                        <option value="low">Niedrig</option>
                        <option value="normal">Normal</option>
                        <option value="high">Hoch</option>
                      </NativeSelect>
                    </>
                  ) : null}
                  {a.type === "set_follow_up" ? (
                    <>
                      <Input className="w-24" type="number" min={1} value={a.days} onChange={(e) => setAct(i, { ...a, days: Number(e.target.value) })} aria-label="Tage" />
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={a.useSuggestedDate} onChange={(e) => setAct(i, { ...a, useSuggestedDate: e.target.checked })} /> von KI erkanntes Datum bevorzugen
                      </label>
                    </>
                  ) : null}
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Aktion entfernen" disabled={v.actions.length === 1} onClick={() => setV({ ...v, actions: v.actions.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setV({ ...v, actions: [...v.actions, newAction("notify")] })}>
              <Plus /> Aktion
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveAutomationAction(v.id ?? null, { ...v, conditions: v.conditions as never, actions: v.actions as never });
                if (r.ok) {
                  toast.success("Gespeichert");
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AutomationRowActions({ value, triggers }: { value: AutomationValues; triggers: Record<string, { label: string; description: string }> }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(value.enabled);
  return (
    <div className="flex items-center gap-1">
      <Switch
        checked={enabled}
        aria-label="Aktiv"
        onCheckedChange={async (c) => {
          setEnabled(c);
          const r = await toggleAutomationAction(value.id!, c);
          if (!r.ok) {
            setEnabled(!c);
            toast.error(r.error);
          }
          router.refresh();
        }}
      />
      <AutomationEditor
        initial={value}
        triggers={triggers}
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label="Bearbeiten">
            <Pencil />
          </Button>
        }
      />
      <ConfirmButton
        size="icon-sm"
        title="Automatisierung löschen?"
        className="border-0 shadow-none"
        onConfirm={async () => {
          const r = await deleteAutomationAction(value.id!);
          if (!r.ok) toast.error(r.error);
          router.refresh();
        }}
      >
        <Trash2 />
      </ConfirmButton>
    </div>
  );
}
