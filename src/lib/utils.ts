import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("de-DE");
const pct = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });

export const fmt = {
  eur: (v: number | string | null | undefined) => eur.format(Number(v ?? 0)),
  eur2: (v: number | string | null | undefined) => eur2.format(Number(v ?? 0)),
  num: (v: number | string | null | undefined) => num.format(Number(v ?? 0)),
  pct: (v: number) => pct.format(Number.isFinite(v) ? v : 0),
  date: (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–",
  dateTime: (d: Date | string | null | undefined) =>
    d
      ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "–",
  time: (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–",
  relative: (d: Date | string | null | undefined) => {
    if (!d) return "–";
    const diff = (new Date(d).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), "second");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
    return fmt.date(d);
  },
};

/** Aktuelle Zeit für Server Components (werden pro Anfrage dynamisch gerendert). */
export function requestTime(): number {
  return new Date().getTime();
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function contactName(c: { firstName?: string | null; lastName?: string | null; email?: string | null }) {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return n || c.email || "Unbekannt";
}

export function toInt(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
