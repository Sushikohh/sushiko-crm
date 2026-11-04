"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlugZap, Trash2, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Switch } from "@/components/ui/overlay";
import { Badge, Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { fmt } from "@/lib/utils";
import { changePasswordAction } from "@/server/actions/auth";
import {
  addSuppressionAction,
  deleteMailboxAction,
  inviteUserAction,
  removeSuppressionAction,
  saveIdentityAction,
  saveMailboxAction,
  saveSalesSettingsAction,
  setUserActiveAction,
  testMailboxAction,
  updateProfileAction,
} from "@/server/actions/settings";

function useSave() {
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const router = useRouter();
  const save = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> }>, after?: () => void) =>
    start(async () => {
      setErrors({});
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Gespeichert");
      after?.();
      router.refresh();
    });
  return { pending, errors, save };
}

type Identity = { companyName: string; legalForm: string; street: string; postalCode: string; city: string; phone: string; email: string; website: string; managingDirector: string; registerInfo: string; vatId: string };

export function IdentityForm({ initial, readOnly }: { initial: Identity; readOnly: boolean }) {
  const [v, setV] = React.useState(initial);
  const { pending, errors, save } = useSave();
  const f = (k: keyof Identity, label: string, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <Input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} disabled={readOnly} />
    </Field>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unternehmen & Impressum</CardTitle>
        <CardDescription>Pflichtangaben für geschäftliche E-Mails und Angebote (§ 5 DDG, § 35a GmbHG bzw. § 37a HGB). Wird automatisch an jede E-Mail angehängt.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {f("companyName", "Firmenname *")}
        {f("legalForm", "Rechtsform", "z. B. GmbH, UG (haftungsbeschränkt), e. K.")}
        {f("street", "Straße und Hausnummer *")}
        <div className="grid grid-cols-[110px_1fr] gap-2">
          {f("postalCode", "PLZ *")}
          {f("city", "Ort *")}
        </div>
        {f("phone", "Telefon")}
        {f("email", "E-Mail")}
        {f("website", "Website")}
        {f("managingDirector", "Geschäftsführung / Inhaber")}
        {f("registerInfo", "Registergericht & -nummer", "z. B. Amtsgericht Hamburg HRB 123456")}
        {f("vatId", "USt-IdNr.")}
        {!readOnly ? (
          <div className="sm:col-span-2">
            <Button disabled={pending} onClick={() => save(() => saveIdentityAction(v))}>
              {pending ? <Loader2 className="animate-spin" /> : null} Speichern
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type MailboxValues = {
  id?: string;
  name: string;
  email: string;
  fromName: string;
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPassword: string;
  imapFolder: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  dailyLimit: string;
  hasImapPassword?: boolean;
  hasSmtpPassword?: boolean;
};

const PRESETS: Record<string, { imap: string; smtp: string; smtpPort: string }> = {
  "IONOS": { imap: "imap.ionos.de", smtp: "smtp.ionos.de", smtpPort: "465" },
  "STRATO": { imap: "imap.strato.de", smtp: "smtp.strato.de", smtpPort: "465" },
  "Hetzner": { imap: "mail.your-server.de", smtp: "mail.your-server.de", smtpPort: "465" },
  "All-Inkl": { imap: "<server>.kasserver.com", smtp: "<server>.kasserver.com", smtpPort: "465" },
  "Microsoft 365": { imap: "outlook.office365.com", smtp: "smtp.office365.com", smtpPort: "587" },
  "Google Workspace": { imap: "imap.gmail.com", smtp: "smtp.gmail.com", smtpPort: "465" },
  "mailbox.org": { imap: "imap.mailbox.org", smtp: "smtp.mailbox.org", smtpPort: "465" },
};

export function MailboxForm({ initial, status, readOnly }: { initial: MailboxValues; status?: { label: string; lastSyncAt: string | null; lastSyncError: string | null; lastSmtpError: string | null }; readOnly: boolean }) {
  const [v, setV] = React.useState(initial);
  const { pending, errors, save } = useSave();
  const [testing, startTest] = React.useTransition();
  const [test, setTest] = React.useState<{ imap: string; smtp: string } | null>(null);
  const router = useRouter();
  const on = (k: keyof MailboxValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Geschäftliches Postfach</CardTitle>
        <CardDescription>Eingang per IMAP über TLS (Port 993), Versand per SMTP über TLS (465) oder STARTTLS (587). Passwörter werden mit AES-256-GCM verschlüsselt gespeichert.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {status ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <Badge tone={status.label === "Verbunden" ? "green" : status.lastSyncError || status.lastSmtpError ? "red" : "slate"}>{status.label}</Badge>
            <span className="text-xs text-muted-foreground">{status.lastSyncAt ? `${status.lastSyncError ? "Letzter Abrufversuch" : "Zuletzt abgerufen"} ${fmt.dateTime(status.lastSyncAt)}` : "Noch nicht abgerufen"}</span>
            {status.lastSyncError ? <span className="text-xs text-red-600">IMAP: {status.lastSyncError}</span> : null}
            {status.lastSmtpError ? <span className="text-xs text-red-600">SMTP: {status.lastSmtpError}</span> : null}
          </div>
        ) : (
          <Callout tone="amber">Noch kein Postfach verbunden. Die Zugangsdaten erhalten Sie bei Ihrem E-Mail-Hosting-Anbieter.</Callout>
        )}
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Vorlage:
            {Object.entries(PRESETS).map(([name, p]) => (
              <button key={name} className="rounded border px-1.5 py-0.5 hover:bg-muted" onClick={() => setV({ ...v, imapHost: p.imap, smtpHost: p.smtp, smtpPort: p.smtpPort, imapPort: "993", smtpSecure: p.smtpPort === "465" })}>
                {name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="E-Mail-Adresse" error={errors.email}>
            <Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value, imapUser: v.imapUser || e.target.value, smtpUser: v.smtpUser || e.target.value })} disabled={readOnly} />
          </Field>
          <Field label="Absendername">
            <Input value={v.fromName} onChange={on("fromName")} placeholder="z. B. Max Mustermann | Firma" disabled={readOnly} />
          </Field>
          <Field label="Tageslimit (alle E-Mails)" hint="Schützt die Reputation Ihrer Domain.">
            <Input value={v.dailyLimit} onChange={on("dailyLimit")} inputMode="numeric" disabled={readOnly} />
          </Field>
        </div>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_90px_1fr_1fr_120px]">
          <p className="text-xs font-semibold text-muted-foreground sm:col-span-5">IMAP (Eingang)</p>
          <Field label="Server" error={errors.imapHost}>
            <Input value={v.imapHost} onChange={on("imapHost")} disabled={readOnly} />
          </Field>
          <Field label="Port">
            <Input value={v.imapPort} onChange={on("imapPort")} disabled={readOnly} />
          </Field>
          <Field label="Benutzer" error={errors.imapUser}>
            <Input value={v.imapUser} onChange={on("imapUser")} disabled={readOnly} />
          </Field>
          <Field label="Passwort" hint={v.hasImapPassword ? "leer lassen = unverändert" : undefined}>
            <Input type="password" value={v.imapPassword} onChange={on("imapPassword")} autoComplete="new-password" disabled={readOnly} />
          </Field>
          <Field label="Ordner">
            <Input value={v.imapFolder} onChange={on("imapFolder")} disabled={readOnly} />
          </Field>
        </div>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_90px_1fr_1fr_120px]">
          <p className="text-xs font-semibold text-muted-foreground sm:col-span-5">SMTP (Versand)</p>
          <Field label="Server" error={errors.smtpHost}>
            <Input value={v.smtpHost} onChange={on("smtpHost")} disabled={readOnly} />
          </Field>
          <Field label="Port">
            <Input value={v.smtpPort} onChange={(e) => setV({ ...v, smtpPort: e.target.value, smtpSecure: e.target.value === "465" })} disabled={readOnly} />
          </Field>
          <Field label="Benutzer" error={errors.smtpUser}>
            <Input value={v.smtpUser} onChange={on("smtpUser")} disabled={readOnly} />
          </Field>
          <Field label="Passwort" hint={v.hasSmtpPassword ? "leer lassen = unverändert" : undefined}>
            <Input type="password" value={v.smtpPassword} onChange={on("smtpPassword")} autoComplete="new-password" disabled={readOnly} />
          </Field>
          <Field label="Verschlüsselung">
            <div className="flex h-9 items-center text-xs text-muted-foreground">{v.smtpPort === "465" ? "TLS" : "STARTTLS (erzwungen)"}</div>
          </Field>
        </div>
        {test ? (
          <div className="grid gap-1 rounded-lg border p-3 text-sm">
            {(["imap", "smtp"] as const).map((k) => (
              <p key={k} className="flex items-center gap-2">
                {test[k].startsWith("OK") ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
                <b className="uppercase">{k}</b> {test[k]}
              </p>
            ))}
          </div>
        ) : null}
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                save(
                  () =>
                    saveMailboxAction(v.id ?? null, {
                      ...v,
                      name: "Geschäftspostfach",
                      imapPort: Number(v.imapPort),
                      smtpPort: Number(v.smtpPort),
                      dailyLimit: Number(v.dailyLimit),
                      imapPassword: v.imapPassword || undefined,
                      smtpPassword: v.smtpPassword || undefined,
                    }),
                  () => setV((s) => ({ ...s, imapPassword: "", smtpPassword: "", hasImapPassword: true, hasSmtpPassword: true })),
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Speichern
            </Button>
            {v.id ? (
              <>
                <Button
                  variant="outline"
                  disabled={testing}
                  onClick={() =>
                    startTest(async () => {
                      const r = await testMailboxAction(v.id!);
                      if (r.ok) setTest(r.data!);
                      else toast.error(r.error);
                      router.refresh();
                    })
                  }
                >
                  {testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Verbindung testen
                </Button>
                <ConfirmButton
                  size="default"
                  title="Postfach entfernen?"
                  description="Gespeicherte E-Mails bleiben erhalten, es werden aber keine neuen abgerufen oder versendet."
                  onConfirm={async () => {
                    await deleteMailboxAction(v.id!);
                    router.refresh();
                  }}
                >
                  <Trash2 /> Entfernen
                </ConfirmButton>
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProfileForm({ initial, localAuth }: { initial: { fullName: string; emailSignature: string }; localAuth: boolean }) {
  const [v, setV] = React.useState(initial);
  const [pw, setPw] = React.useState({ current: "", next: "" });
  const { pending, save } = useSave();
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Mein Profil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field label="Name">
            <Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
          </Field>
          <Field label="E-Mail-Signatur" hint="Wird vor dem Impressum angehängt.">
            <Textarea rows={5} value={v.emailSignature} onChange={(e) => setV({ ...v, emailSignature: e.target.value })} placeholder={"Mit freundlichen Grüßen\nMax Mustermann\nGeschäftsführer"} />
          </Field>
          <Button className="w-fit" disabled={pending} onClick={() => save(() => updateProfileAction(v))}>
            Speichern
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Passwort ändern</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {localAuth ? (
            <Field label="Aktuelles Passwort">
              <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </Field>
          ) : null}
          <Field label="Neues Passwort (mind. 10 Zeichen)">
            <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </Field>
          <Button
            variant="outline"
            disabled={pending || pw.next.length < 10}
            onClick={() =>
              save(async () => {
                const r = await changePasswordAction(pw.current, pw.next);
                return r.ok ? { ok: true, message: "Passwort geändert" } : { ok: false, error: r.error };
              }, () => setPw({ current: "", next: "" }))
            }
          >
            Passwort ändern
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function TeamPanel({ users, meId, isAdmin, localAuth }: { users: { id: string; fullName: string; email: string; role: "admin" | "member"; active: boolean; createdAt: string }[]; meId: string; isAdmin: boolean; localAuth: boolean }) {
  const [v, setV] = React.useState({ fullName: "", email: "", role: "member" as "admin" | "member", password: "" });
  const { pending, save } = useSave();
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.fullName} {u.id === meId ? <span className="text-xs text-muted-foreground">(Sie)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <Badge tone={u.role === "admin" ? "violet" : "slate"}>{u.role === "admin" ? "Administrator" : "Mitarbeiter"}</Badge>
              {isAdmin && u.id !== meId ? (
                <>
                  <NativeSelect className="h-8 w-auto text-xs" value={u.role} onChange={(e) => save(() => setUserActiveAction(u.id, u.active, e.target.value as "admin" | "member"))} aria-label="Rolle">
                    <option value="member">Mitarbeiter</option>
                    <option value="admin">Administrator</option>
                  </NativeSelect>
                  <label className="flex items-center gap-1.5 text-xs">
                    Aktiv <Switch checked={u.active} onCheckedChange={(c) => save(() => setUserActiveAction(u.id, c))} />
                  </label>
                </>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Mitarbeiter hinzufügen</CardTitle>
            <CardDescription>{localAuth ? "Legen Sie ein Startpasswort fest und teilen Sie es sicher mit." : "Die Person erhält eine Einladung von Supabase Auth per E-Mail."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Name">
              <Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
            </Field>
            <Field label="E-Mail">
              <Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field label="Rolle">
              <NativeSelect value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as "admin" | "member" })}>
                <option value="member">Mitarbeiter</option>
                <option value="admin">Administrator</option>
              </NativeSelect>
            </Field>
            {localAuth ? (
              <Field label="Startpasswort">
                <Input type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} autoComplete="new-password" />
              </Field>
            ) : null}
            <Button className="w-fit" disabled={pending} onClick={() => save(() => inviteUserAction(v), () => setV({ fullName: "", email: "", role: "member", password: "" }))}>
              <UserPlus /> Hinzufügen
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function SuppressionPanel({ items, isAdmin }: { items: { id: string; email: string; reason: string; createdAt: string }[]; isAdmin: boolean }) {
  const [v, setV] = React.useState({ email: "", reason: "" });
  const { pending, save } = useSave();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sperrliste</CardTitle>
        <CardDescription>An diese Adressen werden niemals Werbe-E-Mails gesendet (Widersprüche, Abmeldungen, Hard Bounces, Beschwerden).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Input className="w-64" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="adresse@firma.de" />
          <Input className="w-64" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="Grund (z. B. telefonischer Widerspruch)" />
          <Button disabled={pending || !v.email} onClick={() => save(() => addSuppressionAction(v.email, v.reason), () => setV({ email: "", reason: "" }))}>
            Sperren
          </Button>
        </div>
        <div className="max-h-[480px] overflow-y-auto rounded-lg border">
          {items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Keine gesperrten Adressen.</p> : null}
          {items.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0">
              <span>
                <span className="font-medium">{s.email}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {s.reason} · {fmt.date(s.createdAt)}
                </span>
              </span>
              {isAdmin ? (
                <ConfirmButton
                  size="sm"
                  title="Sperre aufheben?"
                  description="Nur aufheben, wenn die Sperre irrtümlich gesetzt wurde. Ein Werbewiderspruch bleibt in der Einwilligungshistorie bestehen; Werbung ist erst nach neuer ausdrücklicher Einwilligung wieder zulässig."
                  confirmLabel="Aufheben"
                  onConfirm={() => save(() => removeSuppressionAction(s.email))}
                >
                  Aufheben
                </ConfirmButton>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesForm({ initial }: { initial: { defaultFollowUpDays: number; noResponseAfterDays: number; avgContractMonths: number; offerPrefix: string } }) {
  const [v, setV] = React.useState(initial);
  const { pending, save } = useSave();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vertrieb</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label="Standard-Wiedervorlage (Tage)">
          <Input type="number" value={v.defaultFollowUpDays} onChange={(e) => setV({ ...v, defaultFollowUpDays: Number(e.target.value) })} />
        </Field>
        <Field label="„Keine Antwort“ nach (Tagen)" hint="nach letztem Sequenzschritt">
          <Input type="number" value={v.noResponseAfterDays} onChange={(e) => setV({ ...v, noResponseAfterDays: Number(e.target.value) })} />
        </Field>
        <Field label="Angebotsnummer-Präfix">
          <Input value={v.offerPrefix} onChange={(e) => setV({ ...v, offerPrefix: e.target.value })} />
        </Field>
        <Button className="w-fit" disabled={pending} onClick={() => save(() => saveSalesSettingsAction(v))}>
          Speichern
        </Button>
      </CardContent>
    </Card>
  );
}
