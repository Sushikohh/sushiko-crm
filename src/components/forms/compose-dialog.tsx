"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Callout, Field, Input, Textarea } from "@/components/ui/primitives";
import { aiDraftReplyAction, sendEmailAction } from "@/server/actions/email";

export function ComposeDialog({
  to = "",
  subject = "",
  body = "",
  contactId,
  companyId,
  replyToMessageId,
  aiAvailable,
  trigger,
}: {
  to?: string;
  subject?: string;
  body?: string;
  contactId?: string | null;
  companyId?: string | null;
  replyToMessageId?: string | null;
  aiAvailable?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ to, subject, body });
  const [confirm, setConfirm] = React.useState(false);
  const [instr, setInstr] = React.useState("");
  const [pending, start] = React.useTransition();
  const [aiPending, startAi] = React.useTransition();
  const router = useRouter();
  const isReply = !!replyToMessageId;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setV({ to, subject, body });
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Mail /> E-Mail
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{isReply ? "Antworten" : "E-Mail schreiben"}</DialogTitle>
          <DialogDescription>Signatur und Pflichtangaben (Impressum) werden automatisch angehängt.</DialogDescription>
        </DialogHeader>
        {!isReply ? (
          <Callout tone="amber">
            Über dieses Formular nur <b>individuelle Geschäftskorrespondenz</b> senden (z. B. Antwort auf eine Anfrage, Terminbestätigung, angefordertes Angebot). Werbe-E-Mails ausschließlich über Kampagnen mit nachgewiesener Einwilligung.
          </Callout>
        ) : null}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sendEmailAction({ ...v, contactId: contactId ?? null, companyId: companyId ?? null, replyToMessageId: replyToMessageId ?? null, confirmNotAdvertising: confirm });
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success("E-Mail in Versandwarteschlange");
              setOpen(false);
              setConfirm(false);
              router.refresh();
            });
          }}
        >
          <Field label="An">
            <Input type="email" value={v.to} onChange={(e) => setV((s) => ({ ...s, to: e.target.value }))} required />
          </Field>
          <Field label="Betreff">
            <Input value={v.subject} onChange={(e) => setV((s) => ({ ...s, subject: e.target.value }))} required />
          </Field>
          <Field label="Nachricht">
            <Textarea value={v.body} onChange={(e) => setV((s) => ({ ...s, body: e.target.value }))} rows={12} required />
          </Field>
          {isReply && aiAvailable ? (
            <div className="flex gap-2">
              <Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Hinweise für den KI-Entwurf (optional), z. B. „Termin Dienstag 10 Uhr anbieten“" className="text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={aiPending}
                onClick={() =>
                  startAi(async () => {
                    const r = await aiDraftReplyAction(replyToMessageId!, instr);
                    if (r.ok && r.data) {
                      setV((s) => ({ ...s, body: r.data!.body, subject: s.subject || r.data!.subject }));
                      toast.success("KI-Entwurf eingefügt – bitte prüfen");
                    } else if (!r.ok) toast.error(r.error);
                  })
                }
              >
                {aiPending ? <Loader2 className="animate-spin" /> : <Sparkles />} KI-Entwurf
              </Button>
            </div>
          ) : null}
          {!isReply ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <span>Ich bestätige, dass diese E-Mail keine Werbung ist bzw. vom Empfänger angefordert wurde.</span>
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending || (!isReply && !confirm)}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              Senden
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
