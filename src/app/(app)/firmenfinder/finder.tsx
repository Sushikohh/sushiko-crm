"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Download, ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/overlay";
import { Badge, Card, Field, Input, NativeSelect, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { HAMBURG_DISTRICTS, INDUSTRIES, type IndustryKey } from "@/lib/constants";
import { importFinderAction, searchFinderAction, type FinderHit } from "@/server/actions/finder";

export function Finder() {
  const [q, setQ] = React.useState({ industry: "property_management", name: "", quarter: "", postalCode: "", limit: "150" });
  const [hits, setHits] = React.useState<FinderHit[] | null>(null);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [searching, startSearch] = React.useTransition();
  const [importing, startImport] = React.useTransition();
  const [hideExisting, setHideExisting] = React.useState(false);

  const visible = (hits ?? []).filter((h) => !hideExisting || !h.existingId);
  const selectable = visible.filter((h) => !h.existingId);

  const search = () =>
    startSearch(async () => {
      setSel(new Set());
      const r = await searchFinderAction({ ...q, limit: Number(q.limit) });
      if (r.ok) {
        setHits(r.data!);
        if (!r.data!.length) toast.info("Keine Treffer für diese Suche.");
      } else toast.error(r.error);
    });

  const doImport = () =>
    startImport(async () => {
      const items = (hits ?? []).filter((h) => sel.has(h.sourceRef)).map(({ existingId: _e, existingReason: _r, ...rest }) => rest);
      const r = await importFinderAction(items);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.data!.created} Unternehmen übernommen${r.data!.duplicates ? `, ${r.data!.duplicates} bereits vorhanden` : ""}`);
      setHits((hs) => hs?.map((h, i) => (sel.has(h.sourceRef) ? { ...h, existingId: r.data!.ids[items.findIndex((x) => x.sourceRef === h.sourceRef)] ?? h.existingId, existingReason: "übernommen" } : h)) ?? null);
      setSel(new Set());
    });

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <form
          className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_120px_110px_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Field label="Branche / Zielgruppe">
            <NativeSelect value={q.industry} onChange={(e) => setQ({ ...q, industry: e.target.value })}>
              <option value="all">Alle Zielbranchen</option>
              {Object.entries(INDUSTRIES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Firmenname enthält">
            <Input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="optional" />
          </Field>
          <Field label="Stadtteil">
            <NativeSelect value={q.quarter} onChange={(e) => setQ({ ...q, quarter: e.target.value, postalCode: "" })}>
              <option value="">Ganz Hamburg</option>
              {Object.entries(HAMBURG_DISTRICTS).map(([bezirk, quarters]) => (
                <optgroup key={bezirk} label={`Bezirk ${bezirk}`}>
                  {quarters.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="PLZ">
            <Input value={q.postalCode} onChange={(e) => setQ({ ...q, postalCode: e.target.value, quarter: "" })} placeholder="z. B. 22765" maxLength={5} inputMode="numeric" />
          </Field>
          <Field label="Max. Treffer">
            <NativeSelect value={q.limit} onChange={(e) => setQ({ ...q, limit: e.target.value })}>
              <option value="50">50</option>
              <option value="150">150</option>
              <option value="300">300</option>
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="animate-spin" /> : <Search />} Suchen
          </Button>
        </form>
      </Card>

      {hits ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {hits.length} Treffer · {hits.filter((h) => h.existingId).length} bereits im CRM · {sel.size} ausgewählt
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={hideExisting} onChange={(e) => setHideExisting(e.target.checked)} /> Vorhandene ausblenden
              </label>
              <Button size="sm" disabled={!sel.size || importing} onClick={doImport}>
                {importing ? <Loader2 className="animate-spin" /> : <Download />} {sel.size} übernehmen
              </Button>
            </div>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-8">
                    <Checkbox
                      checked={selectable.length > 0 && selectable.every((h) => sel.has(h.sourceRef))}
                      onCheckedChange={(c) => setSel(c ? new Set(selectable.map((h) => h.sourceRef)) : new Set())}
                      aria-label="Alle auswählen"
                    />
                  </TH>
                  <TH>Unternehmen</TH>
                  <TH>Branche</TH>
                  <TH>Adresse</TH>
                  <TH>Kontakt (öffentlich)</TH>
                  <TH>Im CRM</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((h) => (
                  <TR key={h.sourceRef}>
                    <TD>
                      <Checkbox
                        disabled={!!h.existingId}
                        checked={sel.has(h.sourceRef)}
                        onCheckedChange={() =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (n.has(h.sourceRef)) n.delete(h.sourceRef);
                            else n.add(h.sourceRef);
                            return n;
                          })
                        }
                        aria-label="Auswählen"
                      />
                    </TD>
                    <TD className="max-w-64">
                      <p className="font-medium">{h.name}</p>
                      <a href={`https://www.openstreetmap.org/${h.sourceRef}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:underline">
                        OSM {h.sourceRef} <ExternalLink className="size-2.5" />
                      </a>
                    </TD>
                    <TD className="text-xs text-muted-foreground">{INDUSTRIES[h.industry as IndustryKey]}</TD>
                    <TD className="text-xs">
                      {h.street ?? <span className="text-muted-foreground">Straße unbekannt</span>}
                      <span className="block text-muted-foreground">{[h.postalCode, h.district ?? h.city].filter(Boolean).join(" ")}</span>
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {h.website ? <span className="block truncate">{h.website.replace(/^https?:\/\//, "")}</span> : null}
                      {h.phone ? <span className="block">{h.phone}</span> : null}
                      {h.email ? <span className="block">{h.email}</span> : null}
                      {!h.website && !h.phone && !h.email ? "–" : null}
                    </TD>
                    <TD>
                      {h.existingId ? (
                        <Link href={`/unternehmen/${h.existingId}`}>
                          <Badge tone="green">
                            <CheckCircle2 className="size-3" /> {h.existingReason}
                          </Badge>
                        </Link>
                      ) : (
                        <Badge>neu</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">Daten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL). Angaben können unvollständig oder veraltet sein – bitte vor Kontaktaufnahme prüfen.</p>
        </>
      ) : null}
    </div>
  );
}
