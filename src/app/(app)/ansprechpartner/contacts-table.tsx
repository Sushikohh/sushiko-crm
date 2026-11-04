"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Megaphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, ConfirmButton } from "@/components/ui/overlay";
import { NativeSelect, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { SortHeader } from "@/components/list-filters";
import { PermissionBadge, StatusBadge } from "@/components/status";
import { ACQ_STATUS, type AcqStatus, type PermissionBasisKey } from "@/lib/constants";
import { deleteContactsAction, updateContactAction } from "@/server/actions/contacts";
import { addRecipientsAction } from "@/server/actions/campaigns";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  status: AcqStatus;
  companyId: string | null;
  companyName: string | null;
  permitted: boolean;
  basis: string | null;
  suppressed: boolean;
};

export function ContactsTable({ rows, sort, campaigns }: { rows: ContactRow[]; sort: string; campaigns: { id: string; name: string }[] }) {
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const ids = [...sel];
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));

  return (
    <>
      {sel.size > 0 ? (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
          <span className="px-2 text-sm font-medium">{sel.size} ausgewählt</span>
          <NativeSelect
            className="h-8 w-auto text-xs"
            value=""
            disabled={pending}
            aria-label="Zu Kampagne hinzufügen"
            onChange={(e) => {
              const campaignId = e.target.value;
              if (!campaignId) return;
              start(async () => {
                const r = await addRecipientsAction(campaignId, ids);
                if (r.ok) toast.success(`${r.data!.added} hinzugefügt${r.data!.skipped ? `, ${r.data!.skipped} ohne Werbeerlaubnis übersprungen` : ""}`);
                else toast.error(r.error);
              });
            }}
          >
            <option value="">Zu Kampagne hinzufügen …</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className="h-8 w-auto text-xs"
            value=""
            disabled={pending}
            aria-label="Status setzen"
            onChange={(e) => {
              const status = e.target.value as AcqStatus;
              if (!status) return;
              start(async () => {
                for (const id of ids) await updateContactAction(id, { status });
                toast.success("Status gesetzt");
                router.refresh();
              });
            }}
          >
            <option value="">Status setzen …</option>
            {Object.entries(ACQ_STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/export/contacts?ids=${ids.join(",")}`}>
              <Download /> Export
            </a>
          </Button>
          <ConfirmButton
            title={`${sel.size} Ansprechpartner löschen?`}
            description="Die Einwilligungs- und Sperrhistorie der E-Mail-Adressen bleibt aus Nachweisgründen erhalten."
            confirmLabel="Löschen"
            onConfirm={async () => {
              const r = await deleteContactsAction(ids);
              if (r.ok) {
                setSel(new Set());
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            <Trash2 /> Löschen
          </ConfirmButton>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
            Auswahl aufheben
          </Button>
        </div>
      ) : null}
      <div className="rounded-xl border bg-card">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-8">
                <Checkbox checked={all} onCheckedChange={(c) => setSel(c ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Alle auswählen" />
              </TH>
              <TH>
                <SortHeader field="name" label="Name" current={sort} />
              </TH>
              <TH>
                <SortHeader field="company" label="Unternehmen" current={sort} />
              </TH>
              <TH>Kontakt</TH>
              <TH>
                <SortHeader field="status" label="Status" current={sort} />
              </TH>
              <TH>
                <span className="inline-flex items-center gap-1">
                  <Megaphone className="size-3" /> Werbeerlaubnis
                </span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} data-state={sel.has(r.id) ? "selected" : undefined}>
                <TD>
                  <Checkbox
                    checked={sel.has(r.id)}
                    onCheckedChange={() =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    aria-label="Auswählen"
                  />
                </TD>
                <TD>
                  <Link href={`/ansprechpartner/${r.id}`} className="font-medium hover:underline">
                    {`${r.firstName} ${r.lastName}`.trim() || r.email || "Unbekannt"}
                  </Link>
                  {r.position ? <p className="text-xs text-muted-foreground">{r.position}</p> : null}
                </TD>
                <TD className="text-sm">
                  {r.companyId ? (
                    <Link href={`/unternehmen/${r.companyId}`} className="hover:underline">
                      {r.companyName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TD>
                <TD className="text-xs text-muted-foreground">
                  {r.email ?? "–"}
                  {r.phone ? <span className="block">{r.phone}</span> : null}
                </TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD>{r.email ? <PermissionBadge basis={(r.suppressed && (!r.basis || r.basis === "none") ? "objected" : (r.basis ?? "none")) as PermissionBasisKey} allowed={r.permitted} /> : <span className="text-xs text-muted-foreground">keine E-Mail</span>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}
