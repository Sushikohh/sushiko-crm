"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { Callout, Field, Input } from "@/components/ui/primitives";
import { INDUSTRIES, type IndustryKey } from "@/lib/constants";
import { importCsvAction, previewCsvAction } from "@/server/actions/companies";

type Preview = { count: number; errors: { line: number; message: string }[]; mappedColumns: Record<string, string>; sample: { name: string; industry: string; postalCode?: string; contact: string | null; consent: boolean }[] };

export function CsvImportDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [result, setResult] = React.useState<{ created: number; duplicates: number; contacts: number; consents: number; errors: { line: number; message: string }[] } | null>(null);
  const [pending, start] = React.useTransition();
  const router = useRouter();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    const buf = await f.arrayBuffer();
    // UTF-8 bevorzugt, Fallback Windows-1252 (Excel-Export)
    let t = new TextDecoder("utf-8").decode(buf);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
    setText(t);
    start(async () => {
      const r = await previewCsvAction(t);
      if (r.ok) setPreview(r.data!);
      else toast.error(r.error);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPreview(null);
          setText("");
          setResult(null);
          setFileName("");
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Upload /> CSV-Import
          </Button>
        )}
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Unternehmen per CSV importieren</DialogTitle>
          <DialogDescription>
            Trennzeichen „;“ oder „,“. Spalten werden automatisch erkannt (z. B. Firma, Branche, PLZ, Ort, Website, Telefon, Vorname, Nachname, Funktion, E-Mail Ansprechpartner).{" "}
            {/* Datei-Download über Route Handler, keine Seitennavigation */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="underline" href="/api/export/template" download>
              Vorlage herunterladen
            </a>
          </DialogDescription>
        </DialogHeader>
        <Callout tone="amber">
          Werbeeinwilligungen werden nur übernommen, wenn die Spalten <b>Einwilligung</b>, <b>Einwilligungsdatum</b> und <b>Einwilligungsnachweis</b> ausgefüllt sind. Importieren Sie nur Daten, die Sie rechtmäßig erhoben haben.
        </Callout>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/40">
          <FileUp className="size-6" />
          {fileName || "CSV-Datei auswählen"}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {preview && !result ? (
          <div className="grid gap-3 text-sm">
            <p>
              <b>{preview.count}</b> Datensätze erkannt. Zugeordnete Spalten: {Object.entries(preview.mappedColumns).map(([h, f]) => `${h} → ${f}`).join(", ") || "keine"}
            </p>
            {preview.sample.length ? (
              <div className="rounded-lg border text-xs">
                {preview.sample.map((s, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b px-3 py-1.5 last:border-0">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">
                      {INDUSTRIES[s.industry as IndustryKey]} {s.postalCode ?? ""} {s.contact ? `· ${s.contact}` : ""} {s.consent ? "· Einwilligung ✓" : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {preview.errors.length ? (
              <Callout tone="red" title={`${preview.errors.length} Hinweise`}>
                <ul className="max-h-28 list-disc overflow-auto pl-4">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Zeile {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : null}
            <Field label="Tag für alle importierten Unternehmen (optional)">
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="z. B. Import Messe 2026" />
            </Field>
          </div>
        ) : null}
        {result ? (
          <Callout tone="green" title="Import abgeschlossen">
            {result.created} Unternehmen angelegt, {result.duplicates} Duplikate übersprungen, {result.contacts} Ansprechpartner angelegt, {result.consents} Einwilligungen übernommen.
            {result.errors.length ? ` ${result.errors.length} Zeilen mit Hinweisen.` : ""}
          </Callout>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Schließen
          </Button>
          {!result ? (
            <Button
              disabled={!preview?.count || pending}
              onClick={() =>
                start(async () => {
                  const r = await importCsvAction(text, tag);
                  if (r.ok) {
                    setResult(r.data!);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Upload />}
              {preview?.count ?? 0} importieren
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
