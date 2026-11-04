"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, KanbanSquare, ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { DEAL_STAGES, TASK_TYPES } from "@/lib/constants";
import { saveAppointmentAction, saveDealAction, saveTaskAction } from "@/server/actions/sales";

type Opt = { id: string; name: string };

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function useDialogSubmit() {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const submit = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(success);
      setOpen(false);
      router.refresh();
    });
  return { open, setOpen, pending, submit };
}

function CompanyContactFields({
  companies,
  contacts,
  companyId,
  contactId,
  onCompany,
  onContact,
}: {
  companies?: Opt[];
  contacts?: Opt[];
  companyId: string;
  contactId: string;
  onCompany: (v: string) => void;
  onContact: (v: string) => void;
}) {
  return (
    <>
      {companies ? (
        <Field label="Unternehmen">
          <NativeSelect value={companyId} onChange={(e) => onCompany(e.target.value)}>
            <option value="">– wählen –</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {contacts?.length ? (
        <Field label="Ansprechpartner">
          <NativeSelect value={contactId} onChange={(e) => onContact(e.target.value)}>
            <option value="">– keiner –</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}

export function TaskDialog({ companyId = "", contactId = "", dealId = "", companies, contacts, owners, trigger }: { companyId?: string; contactId?: string; dealId?: string; companies?: Opt[]; contacts?: Opt[]; owners: Opt[]; trigger?: React.ReactNode }) {
  const d = useDialogSubmit();
  const [v, setV] = React.useState(() => {
    const tomorrow = new Date(Date.now() + 86400_000);
    tomorrow.setHours(9, 0, 0, 0);
    return { title: "", description: "", type: "task", priority: "normal", dueAt: toLocalInput(tomorrow), companyId, contactId, assigneeId: "" };
  });
  const on = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ListPlus /> Aufgabe
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aufgabe / Wiedervorlage</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            d.submit(() => saveTaskAction(null, { ...v, type: v.type as never, priority: v.priority as never, dealId: dealId || null, companyId: v.companyId || null, contactId: v.contactId || null, assigneeId: v.assigneeId || null }), "Aufgabe angelegt");
          }}
        >
          <Field label="Titel">
            <Input value={v.title} onChange={on("title")} required autoFocus placeholder="z. B. Rückruf wegen Besichtigung" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Art">
              <NativeSelect value={v.type} onChange={on("type")}>
                {Object.entries(TASK_TYPES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priorität">
              <NativeSelect value={v.priority} onChange={on("priority")}>
                <option value="low">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="high">Hoch</option>
              </NativeSelect>
            </Field>
            <Field label="Fällig am">
              <Input type="datetime-local" value={v.dueAt} onChange={on("dueAt")} />
            </Field>
            <Field label="Zuständig">
              <NativeSelect value={v.assigneeId} onChange={on("assigneeId")}>
                <option value="">Ich</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <CompanyContactFields companies={companies} contacts={contacts} companyId={v.companyId} contactId={v.contactId} onCompany={(x) => setV((s) => ({ ...s, companyId: x }))} onContact={(x) => setV((s) => ({ ...s, contactId: x }))} />
          </div>
          <Field label="Beschreibung">
            <Textarea value={v.description} onChange={on("description")} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={d.pending}>
              {d.pending ? <Loader2 className="animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AppointmentDialog({ companyId = "", contactId = "", dealId = "", location = "", companies, contacts, trigger }: { companyId?: string; contactId?: string; dealId?: string; location?: string; companies?: Opt[]; contacts?: Opt[]; trigger?: React.ReactNode }) {
  const d = useDialogSubmit();
  const [v, setV] = React.useState(() => {
    const start = new Date(Date.now() + 2 * 86400_000);
    start.setHours(10, 0, 0, 0);
    return { title: "Besichtigung", type: "site_visit", startsAt: toLocalInput(start), endsAt: toLocalInput(new Date(start.getTime() + 3600_000)), location, notes: "", companyId, contactId };
  });
  const on = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <CalendarPlus /> Termin
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Termin planen</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            d.submit(() => saveAppointmentAction(null, { ...v, dealId: dealId || null, companyId: v.companyId || null, contactId: v.contactId || null }), "Termin gespeichert");
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Titel">
              <Input value={v.title} onChange={on("title")} required />
            </Field>
            <Field label="Art">
              <NativeSelect value={v.type} onChange={on("type")}>
                <option value="site_visit">Besichtigung</option>
                <option value="meeting">Gespräch</option>
                <option value="call">Telefontermin</option>
                <option value="handover">Objektübergabe</option>
              </NativeSelect>
            </Field>
            <Field label="Beginn">
              <Input type="datetime-local" value={v.startsAt} onChange={on("startsAt")} required />
            </Field>
            <Field label="Ende">
              <Input type="datetime-local" value={v.endsAt} onChange={on("endsAt")} />
            </Field>
            <CompanyContactFields companies={companies} contacts={contacts} companyId={v.companyId} contactId={v.contactId} onCompany={(x) => setV((s) => ({ ...s, companyId: x }))} onContact={(x) => setV((s) => ({ ...s, contactId: x }))} />
          </div>
          <Field label="Ort">
            <Input value={v.location} onChange={on("location")} />
          </Field>
          <Field label="Notizen">
            <Textarea value={v.notes} onChange={on("notes")} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={d.pending}>
              {d.pending ? <Loader2 className="animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type DealFormValues = { id?: string; title: string; companyId: string; contactId: string; stage: string; monthlyValue: string; expectedCloseDate: string; ownerId: string };

export function DealDialog({ initial, companies, contacts, owners, trigger }: { initial?: Partial<DealFormValues>; companies?: Opt[]; contacts?: Opt[]; owners: Opt[]; trigger?: React.ReactNode }) {
  const d = useDialogSubmit();
  const [v, setV] = React.useState<DealFormValues>({ title: "", companyId: "", contactId: "", stage: "lead", monthlyValue: "", expectedCloseDate: "", ownerId: "", ...initial });
  const on = (k: keyof DealFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={d.open} onOpenChange={d.setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <KanbanSquare /> Deal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Deal bearbeiten" : "Deal anlegen"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            d.submit(
              () =>
                saveDealAction(initial?.id ?? null, {
                  title: v.title,
                  companyId: v.companyId,
                  contactId: v.contactId || null,
                  stage: v.stage as never,
                  monthlyValue: Number(v.monthlyValue.replace(",", ".") || 0),
                  expectedCloseDate: v.expectedCloseDate || null,
                  ownerId: v.ownerId || null,
                }),
              "Deal gespeichert",
            );
          }}
        >
          <Field label="Titel">
            <Input value={v.title} onChange={on("title")} required placeholder="z. B. Unterhaltsreinigung Büroetage" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <CompanyContactFields companies={companies} contacts={contacts} companyId={v.companyId} contactId={v.contactId} onCompany={(x) => setV((s) => ({ ...s, companyId: x }))} onContact={(x) => setV((s) => ({ ...s, contactId: x }))} />
            <Field label="Phase">
              <NativeSelect value={v.stage} onChange={on("stage")}>
                {Object.entries(DEAL_STAGES).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Monatswert (€ netto)">
              <Input value={v.monthlyValue} onChange={on("monthlyValue")} inputMode="decimal" />
            </Field>
            <Field label="Erwarteter Abschluss">
              <Input type="date" value={v.expectedCloseDate} onChange={on("expectedCloseDate")} />
            </Field>
            <Field label="Zuständig">
              <NativeSelect value={v.ownerId} onChange={on("ownerId")}>
                <option value="">Ich</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={d.pending || !v.companyId}>
              {d.pending ? <Loader2 className="animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
