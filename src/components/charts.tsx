"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Diagramm-Bausteine: eine Y-Achse je Diagramm, feste Serienreihenfolge (--chart-1…4),
 * Hover-Tooltips, Legende ab 2 Serien und eine umschaltbare Tabellenansicht (Barrierefreiheit).
 */
export type Series = { key: string; label: string; color: string; format?: "num" | "pct" | "eur" };

const nf = new Intl.NumberFormat("de-DE");
const pf = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });
const ef = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
function format(v: unknown, f: Series["format"] = "num") {
  const n = Number(v ?? 0);
  return f === "pct" ? pf.format(n) : f === "eur" ? ef.format(n) : nf.format(n);
}

function periodLabel(v: string, bucket?: string) {
  if (/^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  if (bucket === "month") return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function ChartTooltip({ active, payload, label, series, bucket }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: Series[]; bucket?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{label ? periodLabel(String(label), bucket) : ""}</p>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums text-foreground">{format(p.value, s.format)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function DataTable<T extends Record<string, unknown>>({ data, xKey, xLabel, series, bucket }: { data: T[]; xKey: string; xLabel: string; series: Series[]; bucket?: string }) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-muted-foreground">
            <th className="py-1.5 text-left font-medium">{xLabel}</th>
            {series.map((s) => (
              <th key={s.key} className="py-1.5 text-right font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5">{periodLabel(String(row[xKey]), bucket)}</td>
              {series.map((s) => (
                <td key={s.key} className="py-1.5 text-right tabular-nums">
                  {format(row[s.key], s.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard<T extends Record<string, unknown>>({
  title,
  description,
  data,
  xKey,
  xLabel = "Zeitraum",
  series,
  kind = "line",
  bucket,
  layout = "horizontal",
  height = 240,
  className,
  empty = "Noch keine Daten im gewählten Zeitraum.",
}: {
  title: string;
  description?: string;
  data: T[];
  xKey: string;
  xLabel?: string;
  series: Series[];
  kind?: "line" | "bar" | "area";
  bucket?: string;
  layout?: "horizontal" | "vertical";
  height?: number;
  className?: string;
  empty?: string;
}) {
  const [table, setTable] = React.useState(false);
  const hasData = data.some((d) => series.some((s) => Number(d[s.key] ?? 0) !== 0));
  const fmt0 = series[0]?.format;
  const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
  const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} horizontal={layout === "horizontal"} />;
  const tooltip = <Tooltip cursor={kind === "bar" ? { fill: "var(--muted)", opacity: 0.6 } : { stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTooltip series={series} bucket={bucket} />} />;
  const yTick = (v: number) => format(v, fmt0);

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <button
          onClick={() => setTable((t) => !t)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={table ? "Diagramm anzeigen" : "Tabelle anzeigen"}
          title={table ? "Diagramm anzeigen" : "Tabelle anzeigen"}
        >
          {table ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
        </button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Legend series={series} />
        {!hasData ? (
          <div className={cn("flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground")} style={{ height }}>
            {empty}
          </div>
        ) : table ? (
          <DataTable data={data} xKey={xKey} xLabel={xLabel} series={series} bucket={bucket} />
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              {kind === "bar" ? (
                <BarChart data={data} layout={layout} margin={{ top: 4, right: 8, left: layout === "vertical" ? 8 : -12, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  {grid}
                  {layout === "vertical" ? (
                    <>
                      <XAxis type="number" {...axis} tickFormatter={yTick} allowDecimals={false} />
                      <YAxis type="category" dataKey={xKey} {...axis} width={130} tickFormatter={(v) => periodLabel(String(v), bucket)} />
                    </>
                  ) : (
                    <>
                      <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => periodLabel(String(v), bucket)} minTickGap={16} />
                      <YAxis {...axis} tickFormatter={yTick} allowDecimals={false} width={56} />
                    </>
                  )}
                  {tooltip}
                  {series.map((s) => (
                    <Bar key={s.key} animationDuration={400} dataKey={s.key} name={s.label} fill={s.color} radius={layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={layout === "vertical" ? 18 : 28} stroke="var(--card)" strokeWidth={1} />
                  ))}
                </BarChart>
              ) : kind === "area" ? (
                <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => periodLabel(String(v), bucket)} minTickGap={16} />
                  <YAxis {...axis} tickFormatter={yTick} width={64} />
                  {tooltip}
                  {series.map((s) => (
                    <Area key={s.key} animationDuration={400} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.12} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => periodLabel(String(v), bucket)} minTickGap={16} />
                  <YAxis {...axis} tickFormatter={yTick} allowDecimals={fmt0 === "pct"} width={56} />
                  {tooltip}
                  {series.map((s) => (
                    <Line key={s.key} animationDuration={400} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Vertriebs-Funnel als horizontale Balken mit Umwandlungsquoten (einzelne Serie, direkte Beschriftung). */
export function FunnelCard({ data, title = "Vertriebs-Funnel" }: { data: { stage: string; value: number }[]; title?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Unternehmen je Phase · Quote zur Vorstufe</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        {data.map((d, i) => {
          const prev = i > 0 ? data[i - 1].value : null;
          const rate = prev ? d.value / prev : null;
          return (
            <div key={d.stage} className="grid grid-cols-[96px_1fr_88px] items-center gap-3 text-xs">
              <span className="text-muted-foreground">{d.stage}</span>
              <div className="h-5 rounded-[4px] bg-muted/60">
                <div className="h-full rounded-[4px] bg-[var(--chart-1)] transition-all" style={{ width: `${Math.max(d.value ? 2 : 0, (d.value / max) * 100)}%` }} />
              </div>
              <span className="text-right tabular-nums">
                <span className="font-medium text-foreground">{nf.format(d.value)}</span>
                {rate !== null ? <span className="ml-1.5 text-muted-foreground">{pf.format(rate)}</span> : null}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
