"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Loader2, Pause, Play, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/overlay";
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, NativeSelect } from "@/components/ui/primitives";
import { ACQ_STATUS, INDUSTRIES } from "@/lib/constants";
import { addRecipientsByFilterAction, archiveCampaignAction, deleteCampaignAction, pauseCampaignAction, removeRecipientsAction, startCampaignAction } from "@/server/actions/campaigns";

export function CampaignControls({ id, status, canDelete }: { id: string; status: string; canDelete: boolean }) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Erledigt");
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => pauseCampaignAction(id))}>
          <Pause /> Pausieren
        </Button>
      ) : status !== "archived" && status !== "completed" ? (
        <Button size="sm" disabled={pending} onClick={() => act(() => startCampaignAction(id))}>
          {pending ? <Loader2 className="animate-spin" /> : <Play />} {status === "paused" ? "Fortsetzen" : "Starten"}
        </Button>
      ) : null}
      {status !== "archived" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => archiveCampaignAction(id))}>
          <Archive /> Archivieren
        </Button>
      ) : null}
      {canDelete ? (
        <ConfirmButton
          title="Kampagne löschen?"
          onConfirm={async () => {
            const r = await deleteCampaignAction(id);
            if (r.ok) router.push("/kampagnen");
            else toast.error(r.error);
          }}
        >
          <Trash2 /> Löschen
        </ConfirmButton>
      ) : null}
    </div>
  );
}

export function AddRecipients({ id, tags }: { id: string; tags: string[] }) {
  const [f, setF] = React.useState({ industry: "", status: "", tag: "", erlaubnis: "ja" });
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Empfänger hinzufügen</CardTitle>
        <CardDescription>Alle passenden Ansprechpartner mit E-Mail-Adresse. Einzelne Kontakte können Sie auch in der Ansprechpartner-Liste auswählen.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <NativeSelect value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
          <option value="">Alle Branchen</option>
          {Object.entries(INDUSTRIES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Alle Status</option>
          {Object.entries(ACQ_STATUS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
          <option value="">Alle Tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={f.erlaubnis} onChange={(e) => setF({ ...f, erlaubnis: e.target.value })}>
          <option value="ja">Nur mit Werbeerlaubnis</option>
          <option value="">Alle (ohne Erlaubnis werden übersprungen)</option>
        </NativeSelect>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const filter = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
              const r = await addRecipientsByFilterAction(id, filter);
              if (r.ok) {
                toast.success(`${r.data!.added} Empfänger hinzugefügt${r.data!.skipped ? `, ${r.data!.skipped} ohne Erlaubnis übersprungen` : ""}`);
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Hinzufügen
        </Button>
      </CardContent>
    </Card>
  );
}

export function RemoveRecipient({ campaignId, recipientId }: { campaignId: string; recipientId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={pending}
      aria-label="Entfernen"
      onClick={() =>
        start(async () => {
          await removeRecipientsAction(campaignId, [recipientId]);
          router.refresh();
        })
      }
    >
      <Trash2 />
    </Button>
  );
}

export function Readiness({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <Callout tone="amber" title="Vor dem Start erforderlich" className="mb-4">
      <ul className="list-disc pl-4">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </Callout>
  );
}
