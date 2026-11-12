"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Callout, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { ACQ_STATUS, HAMBURG_QUARTERS, INDUSTRIES } from "@/lib/constants";
import { createCompanyAction, updateCompanyAction } from "@/server/actions/companies";
import type { DuplicateMatch } from "@/lib/services/companies";

export type CompanyFormValues = {
  id?: string;
  name: string;
  industry: string;
  street: string;
  postalCode: string;
  city: string;
  district: string;
  website: string;
  phone: string;
  email: string;
  companySize: string;
  employeeCount: string;
  eventGuests: string;
  estimatedMonthlyValue: string;
  status: string;
  ownerId: string;
  tags: string;
  notes: string;
};

const empty: CompanyFormValues = {
  name: "", industry: "office", street: "", postalCode: "", city: "Hamburg", district: "", website: "", phone: "", email: "",
  companySize: "", employeeCount: "", eventGuests: "", estimatedMonthlyValue: "", status: "new", ownerId: "", tags: "", notes: "",
};

export function CompanyFormDialog({ initial, owners, trigger }: { initial?: Partial<CompanyFormValues>; owners: { id: string; name: string }[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<CompanyFormValues>({ ...empty, ...initial });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [dupes, setDupes] = React.useState<DuplicateMatch[]>([]);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const edit = !!initial?.id;
  const on = (k: keyof CompanyFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const payload = () => ({
    name: v.name,
    industry: v.industry,
    street: v.street,
    postalCode: v.postalCode,
    city: v.city,
    district: v.district,
    website: v.website,
    phone: v.phone,
    email: v.email,
    companySize: v.companySize,
    employeeCount: v.employeeCount ? Number(v.employeeCount) : null,
    eventGuests: v.eventGuests ? Number(v.eventGuests) : null,
    estimatedMonthlyValue: v.estimatedMonthlyValue ? Number(v.estimatedMonthlyValue.replace(",", ".")) : null,
    status: v.status,
    ownerId: v.ownerId || null,
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    notes: v.notes,
  });

  const submit = (force = false) =>
    start(async () => {
      setErrors({});
      if (edit) {
        const r = await updateCompanyAction(initial!.id!, payload());
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.error);
          return;
        }
        toast.success("Unternehmen gespeichert");
        setOpen(false);
        router.refresh();
        return;
      }
      const r = await createCompanyAction(payload(), force);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      if (r.data?.duplicates.length) {
        setDupes(r.data.duplicates);
        return;
      }
      toast.success("Unternehmen angelegt");
      setOpen(false);
      setV(empty);
      setDupes([]);
      if (r.data?.id) router.push(`/unternehmen/${r.data.id}`);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Unternehmen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{edit ? "Unternehmen bearbeiten" : "Unternehmen anlegen"}</DialogTitle>
          <DialogDescription>Öffentliche Kontaktdaten berechtigen nicht automatisch zum Versand von Werbe-E-Mails.</DialogDescription>
        </DialogHeader>
        {dupes.length ? (
          <Callout tone="amber" title="Mögliche Duplikate gefunden">
            <ul className="mb-2 list-disc pl-4">
              {dupes.map((d) => (
                <li key={d.id}>
                  <Link href={`/unternehmen/${d.id}`} className="underline" target="_blank">
                    {d.name}
                  </Link>{" "}
                  {d.postalCode ? `(${d.postalCode})` : ""} – {d.reason}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={() => submit(true)} disabled={pending}>
              Trotzdem anlegen
            </Button>
          </Callout>
        ) : null}
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <Field label="Firmenname *" error={errors.name} className="sm:col-span-2">
            <Input value={v.name} onChange={on("name")} required autoFocus />
          </Field>
          <Field label="Branche">
            <NativeSelect value={v.industry} onChange={on("industry")}>
              {Object.entries(INDUSTRIES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Akquisestatus">
            <NativeSelect value={v.status} onChange={on("status")}>
              {Object.entries(ACQ_STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Straße und Hausnummer">
            <Input value={v.street} onChange={on("street")} />
          </Field>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Field label="PLZ" error={errors.postalCode}>
              <Input value={v.postalCode} onChange={on("postalCode")} inputMode="numeric" maxLength={5} />
            </Field>
            <Field label="Ort">
              <Input value={v.city} onChange={on("city")} />
            </Field>
          </div>
          <Field label="Stadtteil">
            <Input value={v.district} onChange={on("district")} list="hh-quarters" />
            <datalist id="hh-quarters">
              {HAMBURG_QUARTERS.map((q) => (
                <option key={q} value={q} />
              ))}
            </datalist>
          </Field>
          <Field label="Website">
            <Input value={v.website} onChange={on("website")} placeholder="www.beispiel.de" />
          </Field>
          <Field label="Telefon (geschäftlich)">
            <Input value={v.phone} onChange={on("phone")} />
          </Field>
          <Field label="Allgemeine E-Mail (geschäftlich)" error={errors.email} hint="Nur speichern, wenn rechtmäßig erhoben.">
            <Input value={v.email} onChange={on("email")} type="email" />
          </Field>
          <Field label="Mitarbeitende">
            <Input value={v.employeeCount} onChange={on("employeeCount")} inputMode="numeric" />
          </Field>
          <Field label="Typische Gästezahl bei Events">
            <Input value={v.eventGuests} onChange={on("eventGuests")} inputMode="numeric" />
          </Field>
          <Field label="Geschätzter Monatswert (€ netto)">
            <Input value={v.estimatedMonthlyValue} onChange={on("estimatedMonthlyValue")} inputMode="decimal" />
          </Field>
          <Field label="Zuständig">
            <NativeSelect value={v.ownerId} onChange={on("ownerId")}>
              <option value="">– niemand –</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tags (kommagetrennt)" className="sm:col-span-2">
            <Input value={v.tags} onChange={on("tags")} placeholder="z. B. Weihnachtsfeier, Lunch-Abo, Altona" />
          </Field>
          <Field label="Notizen" className="sm:col-span-2">
            <Textarea value={v.notes} onChange={on("notes")} rows={3} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
