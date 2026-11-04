"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Callout, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { setPermissionAction } from "@/server/actions/contacts";

const HELP: Record<string, string> = {
  express_consent:
    "Vorherige, ausdrückliche Einwilligung des Empfängers in E-Mail-Werbung (§ 7 Abs. 2 Nr. 2 UWG). Dokumentieren Sie, wann, wie und mit welchem Wortlaut sie erteilt wurde (z. B. schriftlich, Formular, Visitenkarte mit Einwilligungserklärung).",
  existing_customer:
    "Ausnahme § 7 Abs. 3 UWG: Adresse im Zusammenhang mit einem Verkauf erhalten, Werbung nur für eigene ähnliche Leistungen, kein Widerspruch, und bei Erhebung sowie in jeder E-Mail klarer Hinweis auf das Widerspruchsrecht.",
  objected: "Der Empfänger hat der Werbung widersprochen. Die Adresse wird dauerhaft gesperrt.",
  revoked: "Eine erteilte Einwilligung wurde widerrufen. Die Adresse wird dauerhaft gesperrt.",
  none: "Keine Werbeerlaubnis. Es dürfen keine Werbe-E-Mails versendet werden.",
};

export function PermissionDialog({ contactId, email, current }: { contactId: string; email: string | null; current: string }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ basis: current === "double_opt_in" ? "express_consent" : current, grantedAt: new Date().toISOString().slice(0, 10), evidence: "", source: "", reason: "", confirmLegal: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const needsEvidence = v.basis === "express_consent" || v.basis === "existing_customer";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!email}>
          <ShieldCheck /> Werbeerlaubnis bearbeiten
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Werbeerlaubnis für {email}</DialogTitle>
          <DialogDescription>Jede Änderung wird mit Zeitpunkt, Nutzer und Nachweis protokolliert.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await setPermissionAction({ contactId, basis: v.basis as never, grantedAt: v.grantedAt, evidence: v.evidence, source: v.source, reason: v.reason, confirmLegal: v.confirmLegal });
              if (!r.ok) {
                setErrors(r.fieldErrors ?? {});
                toast.error(r.error);
                return;
              }
              toast.success("Werbeerlaubnis gespeichert");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <Field label="Rechtsgrundlage" error={errors.basis}>
            <NativeSelect value={v.basis} onChange={(e) => setV((s) => ({ ...s, basis: e.target.value }))}>
              <option value="none">Keine Werbeerlaubnis</option>
              <option value="express_consent">Ausdrückliche Einwilligung</option>
              <option value="existing_customer">Bestandskunde (§ 7 Abs. 3 UWG)</option>
              <option value="objected">Werbewiderspruch</option>
              <option value="revoked">Einwilligung widerrufen</option>
            </NativeSelect>
          </Field>
          <Callout tone={needsEvidence ? "blue" : v.basis === "none" ? "amber" : "red"}>{HELP[v.basis]}</Callout>
          {needsEvidence ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Erteilt am" error={errors.grantedAt}>
                  <Input type="date" value={v.grantedAt} onChange={(e) => setV((s) => ({ ...s, grantedAt: e.target.value }))} />
                </Field>
                <Field label="Quelle / Kanal">
                  <Input value={v.source} onChange={(e) => setV((s) => ({ ...s, source: e.target.value }))} placeholder="z. B. Kontaktformular, Messe, Vertrag" />
                </Field>
              </div>
              <Field label="Nachweis (Wortlaut, Ablageort, Referenz)" error={errors.evidence}>
                <Textarea value={v.evidence} onChange={(e) => setV((s) => ({ ...s, evidence: e.target.value }))} rows={4} placeholder="z. B. Schriftliche Einwilligung vom 12.03.2026, Scan im DMS unter …; Wortlaut: „Ich bin einverstanden, …“" />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={v.confirmLegal} onChange={(e) => setV((s) => ({ ...s, confirmLegal: e.target.checked }))} />
                <span>Ich bestätige, dass die rechtlichen Voraussetzungen erfüllt sind und der Nachweis vorliegt.</span>
              </label>
              {errors.confirmLegal ? <p className="text-xs text-destructive">{errors.confirmLegal}</p> : null}
            </>
          ) : (
            <Field label="Grund / Bemerkung">
              <Input value={v.reason} onChange={(e) => setV((s) => ({ ...s, reason: e.target.value }))} />
            </Field>
          )}
          <DialogFooter>
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
