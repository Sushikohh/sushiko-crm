"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, GitMerge, Tag, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, ConfirmButton, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlay";
import { Input, NativeSelect, TBody, TD, TH, THead, TR, Table, Badge } from "@/components/ui/primitives";
import { SortHeader } from "@/components/list-filters";
import { IndustryLabel, PotentialBadge, StatusBadge } from "@/components/status";
import { ACQ_STATUS } from "@/lib/constants";
import type { AcqStatus, IndustryKey } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { bulkUpdateCompaniesAction, deleteCompaniesAction, mergeCompaniesAction } from "@/server/actions/companies";

export type CompanyRow = {
  id: string;
  name: string;
  industry: IndustryKey;
  postalCode: string | null;
  district: string | null;
  city: string | null;
  status: AcqStatus;
  potentialScore: number;
  tags: string[];
  nextFollowUpAt: Date | null;
  ownerName: string | null;
  contactCount: number;
};

export function CompaniesTable({ rows, sort, owners }: { rows: CompanyRow[]; sort: string; owners: { id: string; name: string }[] }) {
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [target, setTarget] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const ids = [...sel];
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const bulk = (input: Parameters<typeof bulkUpdateCompaniesAction>[0]) =>
    start(async () => {
      const r = await bulkUpdateCompaniesAction(input);
      if (r.ok) {
        toast.success(`${r.data} Unternehmen aktualisiert`);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <>
      {sel.size > 0 ? (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
          <span className="px-2 text-sm font-medium">{sel.size} ausgewählt</span>
          <NativeSelect className="h-8 w-auto text-xs" value="" disabled={pending} onChange={(e) => e.target.value && bulk({ ids, status: e.target.value as AcqStatus })} aria-label="Status setzen">
            <option value="">Status setzen …</option>
            {Object.entries(ACQ_STATUS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect className="h-8 w-auto text-xs" value="" disabled={pending} onChange={(e) => e.target.value && bulk({ ids, ownerId: e.target.value === "none" ? null : e.target.value })} aria-label="Zuständig">
            <option value="">Zuständig …</option>
            <option value="none">– niemand –</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (tag.trim()) bulk({ ids, addTag: tag.trim() });
              setTag("");
            }}
          >
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag hinzufügen" className="h-8 w-36 text-xs" />
            <Button size="icon-sm" variant="outline" type="submit" aria-label="Tag hinzufügen">
              <Tag />
            </Button>
          </form>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/export/companies?ids=${ids.join(",")}`}>
              <Download /> Export
            </a>
          </Button>
          {sel.size >= 2 ? (
            <Button size="sm" variant="outline" onClick={() => { setTarget(ids[0]); setMergeOpen(true); }}>
              <GitMerge /> Zusammenführen
            </Button>
          ) : null}
          <ConfirmButton
            title={`${sel.size} Unternehmen löschen?`}
            description="Alle zugehörigen Ansprechpartner, Aktivitäten, Deals, Angebote und Verträge werden ebenfalls gelöscht. Dies kann nicht rückgängig gemacht werden."
            confirmLabel="Endgültig löschen"
            onConfirm={async () => {
              const r = await deleteCompaniesAction(ids);
              if (r.ok) {
                toast.success("Gelöscht");
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
                <SortHeader field="name" label="Unternehmen" current={sort} />
              </TH>
              <TH>Branche</TH>
              <TH>
                <SortHeader field="postal" label="Standort" current={sort} />
              </TH>
              <TH>
                <SortHeader field="status" label="Status" current={sort} />
              </TH>
              <TH>
                <SortHeader field="potential" label="Potenzial" current={sort} />
              </TH>
              <TH>Kontakte</TH>
              <TH>Zuständig</TH>
              <TH>
                <SortHeader field="followup" label="Wiedervorlage" current={sort} />
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} data-state={sel.has(r.id) ? "selected" : undefined}>
                <TD>
                  <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`${r.name} auswählen`} />
                </TD>
                <TD className="max-w-72">
                  <Link href={`/unternehmen/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.tags.length ? (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <Badge key={t} className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </TD>
                <TD className="text-xs">
                  <IndustryLabel industry={r.industry} />
                </TD>
                <TD className="text-xs text-muted-foreground">{[r.postalCode, r.district ?? r.city].filter(Boolean).join(" ") || "–"}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD>
                  <PotentialBadge score={r.potentialScore} />
                </TD>
                <TD className="text-xs tabular-nums">{r.contactCount}</TD>
                <TD className="text-xs">
                  {r.ownerName ? (
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="size-3 text-muted-foreground" />
                      {r.ownerName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TD>
                <TD className={`text-xs ${r.nextFollowUpAt && new Date(r.nextFollowUpAt) < new Date() ? "font-medium text-amber-600" : "text-muted-foreground"}`}>{fmt.date(r.nextFollowUpAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unternehmen zusammenführen</DialogTitle>
            <DialogDescription>Wählen Sie den Datensatz, der erhalten bleibt. Kontakte, Aktivitäten, Deals, Angebote, Verträge und E-Mails der anderen werden übernommen; abweichende Adressen werden als Standorte gespeichert.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {rows
              .filter((r) => sel.has(r.id))
              .map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/5">
                  <input type="radio" name="target" checked={target === r.id} onChange={() => setTarget(r.id)} />
                  <span className="flex-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[r.postalCode, r.district].filter(Boolean).join(" ")} · {r.contactCount} Kontakte
                    </span>
                  </span>
                </label>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={pending || !target}
              onClick={() =>
                start(async () => {
                  const r = await mergeCompaniesAction(target, ids.filter((i) => i !== target));
                  if (r.ok) {
                    toast.success("Unternehmen zusammengeführt");
                    setMergeOpen(false);
                    setSel(new Set());
                    router.push(`/unternehmen/${target}`);
                  } else toast.error(r.error);
                })
              }
            >
              <GitMerge /> Zusammenführen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
