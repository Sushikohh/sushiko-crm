"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/overlay";
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { INDUSTRIES, type IndustryKey } from "@/lib/constants";
import { TEMPLATE_VARIABLES } from "@/lib/templates";
import { previewStepAction, saveCampaignAction } from "@/server/actions/campaigns";

export type CampaignEditorValues = {
  id?: string;
  name: string;
  description: string;
  channel: "smtp" | "brevo";
  mailboxId: string;
  targetIndustries: IndustryKey[];
  dailyLimit: number;
  sendWindowStart: number;
  sendWindowEnd: number;
  sendWeekdaysOnly: boolean;
  minDelaySeconds: number;
  aiPersonalize: boolean;
  stopOnReply: boolean;
  steps: { delayDays: number; subject: string; body: string }[];
};

export const DEFAULT_STEPS: CampaignEditorValues["steps"] = [
  {
    delayDays: 0,
    subject: "Reinigung für {{firma}} in {{stadtteil}}",
    body: `{{anrede}},

vielen Dank für Ihr Interesse an unseren Reinigungsleistungen. Gern stelle ich Ihnen kurz vor, wie wir {{firma}} bei der Unterhalts- und Büroreinigung unterstützen können.

Wir sind ein Hamburger Reinigungsunternehmen und betreuen Gewerbeobjekte mit festen Teams, transparenten Leistungsverzeichnissen und kurzen Reaktionszeiten.

Gern erstellen wir Ihnen nach einer kostenlosen Besichtigung vor Ort ein unverbindliches Angebot. Passt Ihnen ein kurzer Termin in den nächsten Tagen?

Mit freundlichen Grüßen
{{absender}}
{{absender_firma}}`,
  },
  {
    delayDays: 5,
    subject: "Re: Reinigung für {{firma}}",
    body: `{{anrede}},

ich wollte kurz nachhaken, ob Sie Interesse an einer kostenlosen Besichtigung haben. Ein Termin dauert etwa 20 Minuten.

Mit freundlichen Grüßen
{{absender}}`,
  },
];

export function CampaignEditor({ initial, mailboxes, aiConnected, brevoConnected }: { initial: CampaignEditorValues; mailboxes: { id: string; email: string }[]; aiConnected: boolean; brevoConnected: boolean }) {
  const [v, setV] = React.useState<CampaignEditorValues>(initial);
  const [preview, setPreview] = React.useState<{ idx: number; subject: string; body: string; example: boolean } | null>(null);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const setStep = (i: number, patch: Partial<CampaignEditorValues["steps"][number]>) => setV((s) => ({ ...s, steps: s.steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  const bodyRefs = React.useRef<(HTMLTextAreaElement | null)[]>([]);

  const insertVar = (i: number, key: string) => {
    const el = bodyRefs.current[i];
    const token = `{{${key}}}`;
    if (!el) return setStep(i, { body: v.steps[i].body + token });
    const { selectionStart: a, selectionEnd: b } = el;
    const body = v.steps[i].body.slice(0, a) + token + v.steps[i].body.slice(b);
    setStep(i, { body });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const save = () =>
    start(async () => {
      const r = await saveCampaignAction(v.id ?? null, { ...v, mailboxId: v.mailboxId || null, description: v.description || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Kampagne gespeichert");
      router.push(`/kampagnen/${r.data}`);
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Grunddaten</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Name der Kampagne" className="sm:col-span-2">
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="z. B. Hausverwaltungen Altona – Frühjahr" />
            </Field>
            <Field label="Beschreibung / Ziel" className="sm:col-span-2">
              <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
            </Field>
            <Field label="Zielbranchen (nur zur Dokumentation)" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(INDUSTRIES).map(([k, l]) => {
                  const on = v.targetIndustries.includes(k as IndustryKey);
                  return (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setV({ ...v, targetIndustries: on ? v.targetIndustries.filter((x) => x !== k) : [...v.targetIndustries, k as IndustryKey] })}
                      className={`rounded-md border px-2 py-1 text-xs ${on ? "border-brand bg-brand/10 text-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </Field>
          </CardContent>
        </Card>

        {v.steps.map((s, i) => (
          <Card key={i}>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{i === 0 ? "Schritt 1 · Erste E-Mail" : `Schritt ${i + 1} · Nachfass-E-Mail`}</CardTitle>
                <CardDescription>{i === 0 ? "Wird beim Start versendet." : `Wird ${s.delayDays} Tage nach dem vorherigen Schritt gesendet, sofern keine Antwort eingegangen ist.`}</CardDescription>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    start(async () => {
                      const r = await previewStepAction(s.subject, s.body);
                      if (r.ok) setPreview({ idx: i, ...r.data! });
                      else toast.error(r.error);
                    })
                  }
                >
                  <Eye /> Vorschau
                </Button>
                {i > 0 ? (
                  <Button size="icon-sm" variant="ghost" aria-label="Schritt entfernen" onClick={() => setV({ ...v, steps: v.steps.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {i > 0 ? (
                <Field label="Wartezeit (Tage)">
                  <Input type="number" min={1} max={90} value={s.delayDays} onChange={(e) => setStep(i, { delayDays: Number(e.target.value) })} className="w-28" />
                </Field>
              ) : null}
              <Field label="Betreff">
                <Input value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} />
              </Field>
              <Field label="Text" hint="Signatur, Impressum und Abmeldelink werden automatisch angehängt.">
                <Textarea
                  ref={(el) => {
                    bodyRefs.current[i] = el;
                  }}
                  value={s.body}
                  onChange={(e) => setStep(i, { body: e.target.value })}
                  rows={12}
                  className="font-mono text-[13px]"
                />
              </Field>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((t) => (
                  <button key={t.key} type="button" title={t.label} onClick={() => insertVar(i, t.key)} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted">
                    {`{{${t.key}}}`}
                  </button>
                ))}
              </div>
              {preview?.idx === i ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p className="mb-1 text-xs text-muted-foreground">Vorschau {preview.example ? "mit Beispieldaten" : ""}</p>
                  <p className="mb-2 font-medium">{preview.subject}</p>
                  <p className="whitespace-pre-wrap">{preview.body}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {v.steps.length < 6 ? (
          <Button variant="outline" onClick={() => setV({ ...v, steps: [...v.steps, { delayDays: 7, subject: `Re: ${v.steps[0]?.subject ?? ""}`, body: "{{anrede}},\n\n\n\nMit freundlichen Grüßen\n{{absender}}" }] })}>
            <Plus /> Nachfass-Schritt hinzufügen
          </Button>
        ) : null}
      </div>

      <div className="grid content-start gap-4 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle>Versand</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Versandweg">
              <NativeSelect value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value as "smtp" | "brevo" })}>
                <option value="smtp">Eigenes Postfach (SMTP)</option>
                <option value="brevo" disabled={!brevoConnected}>
                  Brevo API {brevoConnected ? "" : "(nicht verbunden)"}
                </option>
              </NativeSelect>
            </Field>
            <Field label="Absender-Postfach">
              <NativeSelect value={v.mailboxId} onChange={(e) => setV({ ...v, mailboxId: e.target.value })}>
                <option value="">Standardpostfach</option>
                {mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tageslimit">
                <Input type="number" min={1} max={500} value={v.dailyLimit} onChange={(e) => setV({ ...v, dailyLimit: Number(e.target.value) })} />
              </Field>
              <Field label="Abstand (Sek.)">
                <Input type="number" min={10} max={3600} value={v.minDelaySeconds} onChange={(e) => setV({ ...v, minDelaySeconds: Number(e.target.value) })} />
              </Field>
              <Field label="Versand ab (Uhr)">
                <Input type="number" min={0} max={23} value={v.sendWindowStart} onChange={(e) => setV({ ...v, sendWindowStart: Number(e.target.value) })} />
              </Field>
              <Field label="Versand bis (Uhr)">
                <Input type="number" min={1} max={24} value={v.sendWindowEnd} onChange={(e) => setV({ ...v, sendWindowEnd: Number(e.target.value) })} />
              </Field>
            </div>
            <label className="flex items-center justify-between text-sm">
              Nur werktags senden
              <Switch checked={v.sendWeekdaysOnly} onCheckedChange={(c) => setV({ ...v, sendWeekdaysOnly: c })} />
            </label>
            <label className="flex items-center justify-between text-sm">
              Sequenz bei Antwort stoppen
              <Switch checked={v.stopOnReply} onCheckedChange={(c) => setV({ ...v, stopOnReply: c })} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>
                KI-Personalisierung
                <span className="block text-xs text-muted-foreground">{aiConnected ? "Leichte Anpassung je Empfänger" : "KI nicht verbunden"}</span>
              </span>
              <Switch disabled={!aiConnected} checked={v.aiPersonalize} onCheckedChange={(c) => setV({ ...v, aiPersonalize: c })} />
            </label>
          </CardContent>
        </Card>
        <Callout tone="blue">
          Empfänger ohne nachgewiesene Werbeerlaubnis werden automatisch übersprungen. Vor jedem einzelnen Versand wird die Erlaubnis erneut geprüft.
        </Callout>
        <Button onClick={save} disabled={pending || !v.name.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Kampagne speichern
        </Button>
      </div>
    </div>
  );
}
