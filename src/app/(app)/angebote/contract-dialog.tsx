"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { CONTRACT_STATUS } from "@/lib/constants";
import { saveContractAction } from "@/server/actions/sales";

export type ContractValues = { id?: string; title: string; companyId: string; monthlyValue: string; startDate: string; endDate: string; noticePeriodMonths: string; serviceScope: string; status: string };

export function ContractDialog({ initial, companies, trigger }: { initial?: Partial<ContractValues>; companies: { id: string; name: string }[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<ContractValues>({ title: "Team-Lunch (wöchentlich)", companyId: "", monthlyValue: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", noticePeriodMonths: "3", serviceScope: "", status: "active", ...initial });
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const on = (k: keyof ContractValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus /> Rahmenvertrag erfassen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{v.id ? "Rahmenvertrag bearbeiten" : "Rahmenvertrag erfassen"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveContractAction(v.id ?? null, {
                title: v.title,
                companyId: v.companyId,
                monthlyValue: Number(v.monthlyValue.replace(",", ".") || 0),
                startDate: v.startDate,
                endDate: v.endDate || null,
                noticePeriodMonths: Number(v.noticePeriodMonths),
                serviceScope: v.serviceScope,
                status: v.status as never,
              });
              if (r.ok) {
                toast.success("Rahmenvertrag gespeichert");
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <Field label="Bezeichnung">
            <Input value={v.title} onChange={on("title")} required />
          </Field>
          <Field label="Unternehmen">
            <NativeSelect value={v.companyId} onChange={on("companyId")} required disabled={!!v.id}>
              <option value="">– wählen –</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monatswert (€ netto)">
              <Input value={v.monthlyValue} onChange={on("monthlyValue")} inputMode="decimal" required />
            </Field>
            <Field label="Status">
              <NativeSelect value={v.status} onChange={on("status")}>
                {Object.entries(CONTRACT_STATUS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Beginn">
              <Input type="date" value={v.startDate} onChange={on("startDate")} required />
            </Field>
            <Field label="Ende (optional)">
              <Input type="date" value={v.endDate} onChange={on("endDate")} />
            </Field>
            <Field label="Kündigungsfrist (Monate)">
              <Input type="number" min={0} max={36} value={v.noticePeriodMonths} onChange={on("noticePeriodMonths")} />
            </Field>
          </div>
          <Field label="Leistungsumfang (Lieferrhythmus, Personen, Menü)">
            <Textarea value={v.serviceScope} onChange={on("serviceScope")} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending || !v.companyId}>
              {pending ? <Loader2 className="animate-spin" /> : null} Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
