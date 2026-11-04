"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { ACQ_STATUS } from "@/lib/constants";
import { createContactAction, updateContactAction } from "@/server/actions/contacts";

export type ContactFormValues = {
  id?: string;
  companyId: string;
  salutation: string;
  firstName: string;
  lastName: string;
  position: string;
  email: string;
  phone: string;
  status: string;
  tags: string;
  notes: string;
  isPrimary: boolean;
};

const empty: ContactFormValues = { companyId: "", salutation: "", firstName: "", lastName: "", position: "", email: "", phone: "", status: "new", tags: "", notes: "", isPrimary: false };

export function ContactDialog({ initial, companies, trigger }: { initial?: Partial<ContactFormValues>; companies?: { id: string; name: string }[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<ContactFormValues>({ ...empty, ...initial });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const edit = !!initial?.id;
  const on = (k: keyof ContactFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = () =>
    start(async () => {
      const payload = {
        companyId: v.companyId || null,
        salutation: v.salutation,
        firstName: v.firstName,
        lastName: v.lastName,
        position: v.position,
        email: v.email,
        phone: v.phone,
        status: v.status as never,
        tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: v.notes,
        isPrimary: v.isPrimary,
      };
      const r = edit ? await updateContactAction(initial!.id!, payload) : await createContactAction(payload);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(edit ? "Gespeichert" : "Ansprechpartner angelegt");
      setOpen(false);
      if (!edit) setV({ ...empty, companyId: initial?.companyId ?? "" });
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Ansprechpartner
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{edit ? "Ansprechpartner bearbeiten" : "Ansprechpartner anlegen"}</DialogTitle>
          <DialogDescription>Die Werbeerlaubnis wird getrennt auf der Kontaktseite mit Nachweis gepflegt.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {companies ? (
            <Field label="Unternehmen" className="sm:col-span-2">
              <NativeSelect value={v.companyId} onChange={on("companyId")}>
                <option value="">– ohne Unternehmen –</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          <div className="grid grid-cols-[110px_1fr] gap-2 sm:col-span-2 sm:grid-cols-[110px_1fr_1fr]">
            <Field label="Anrede">
              <NativeSelect value={v.salutation} onChange={on("salutation")}>
                <option value="">–</option>
                <option value="Frau">Frau</option>
                <option value="Herr">Herr</option>
                <option value="Divers">Divers</option>
              </NativeSelect>
            </Field>
            <Field label="Vorname">
              <Input value={v.firstName} onChange={on("firstName")} autoFocus />
            </Field>
            <Field label="Nachname" className="col-span-2 sm:col-span-1">
              <Input value={v.lastName} onChange={on("lastName")} />
            </Field>
          </div>
          <Field label="Funktion / Position">
            <Input value={v.position} onChange={on("position")} placeholder="z. B. Objektleitung, Praxisinhaberin" />
          </Field>
          <Field label="Status">
            <NativeSelect value={v.status} onChange={on("status")}>
              {Object.entries(ACQ_STATUS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="E-Mail (geschäftlich)" error={errors.email}>
            <Input type="email" value={v.email} onChange={on("email")} />
          </Field>
          <Field label="Telefon">
            <Input value={v.phone} onChange={on("phone")} />
          </Field>
          <Field label="Tags (kommagetrennt)">
            <Input value={v.tags} onChange={on("tags")} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={v.isPrimary} onChange={(e) => setV((s) => ({ ...s, isPrimary: e.target.checked }))} />
            Hauptansprechpartner
          </label>
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
