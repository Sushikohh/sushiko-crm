import { INDUSTRIES, type IndustryKey } from "./constants";

export type TemplateContext = {
  contact: { salutation?: string | null; firstName?: string | null; lastName?: string | null; position?: string | null };
  company: { name: string; district?: string | null; city?: string | null; industry?: string | null };
  sender: { name: string; company: string; phone?: string | null; signature?: string | null };
};

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: "anrede", label: "Briefanrede (z. B. „Sehr geehrte Frau Müller“)" },
  { key: "vorname", label: "Vorname" },
  { key: "nachname", label: "Nachname" },
  { key: "position", label: "Funktion" },
  { key: "firma", label: "Firmenname" },
  { key: "stadtteil", label: "Stadtteil" },
  { key: "branche", label: "Branche" },
  { key: "absender", label: "Name des Absenders" },
  { key: "absender_firma", label: "Eigene Firma" },
  { key: "absender_telefon", label: "Eigene Telefonnummer" },
];

export function letterSalutation(c: TemplateContext["contact"]): string {
  const s = (c.salutation ?? "").toLowerCase();
  if (c.lastName && (s === "frau" || s === "ms" || s === "mrs")) return `Sehr geehrte Frau ${c.lastName}`;
  if (c.lastName && (s === "herr" || s === "mr")) return `Sehr geehrter Herr ${c.lastName}`;
  if (c.firstName && c.lastName) return `Guten Tag ${c.firstName} ${c.lastName}`;
  return "Sehr geehrte Damen und Herren";
}

export function templateValues(ctx: TemplateContext): Record<string, string> {
  return {
    anrede: letterSalutation(ctx.contact),
    vorname: ctx.contact.firstName ?? "",
    nachname: ctx.contact.lastName ?? "",
    position: ctx.contact.position ?? "",
    firma: ctx.company.name,
    stadtteil: ctx.company.district ?? ctx.company.city ?? "Hamburg",
    branche: ctx.company.industry ? (INDUSTRIES[ctx.company.industry as IndustryKey] ?? "") : "",
    absender: ctx.sender.name,
    absender_firma: ctx.sender.company,
    absender_telefon: ctx.sender.phone ?? "",
  };
}

/** Ersetzt {{variable}} bzw. {{variable|Fallback}}. Unbekannte Variablen bleiben leer. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*(?:\|\s*([^}]*))?\}\}/gi, (_m, key: string, fallback?: string) => {
    const v = values[key.toLowerCase()];
    return v && v.trim() ? v : (fallback ?? "").trim();
  });
}

export function findUnknownVariables(template: string): string[] {
  const known = new Set(TEMPLATE_VARIABLES.map((v) => v.key));
  const out = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-z_]+)/gi)) if (!known.has(m[1].toLowerCase())) out.add(m[1]);
  return [...out];
}

export type SenderIdentity = {
  companyName: string;
  legalForm?: string;
  street: string;
  postalCode: string;
  city: string;
  phone?: string;
  email?: string;
  website?: string;
  managingDirector?: string;
  registerInfo?: string;
  vatId?: string;
  taxNumber?: string;
};

export function isSenderIdentityComplete(s: Partial<SenderIdentity> | null | undefined): boolean {
  return !!(s?.companyName && s.street && s.postalCode && s.city);
}

export function legalFooterText(s: SenderIdentity, unsubscribeUrl?: string): string {
  const lines = [
    "--",
    [s.companyName, s.legalForm].filter(Boolean).join(" "),
    `${s.street}, ${s.postalCode} ${s.city}`,
    [s.phone && `Tel. ${s.phone}`, s.email, s.website].filter(Boolean).join(" · "),
    [s.managingDirector && `${/gbr|ohg|kg\b/i.test(s.legalForm ?? "") ? "Gesellschafter" : /e\.?\s?k|inhaber/i.test(s.legalForm ?? "") ? "Inhaber" : "Geschäftsführung"}: ${s.managingDirector}`, s.registerInfo, s.vatId && `USt-IdNr. ${s.vatId}`]
      .filter(Boolean)
      .join(" · "),
  ].filter((l) => l && l.trim());
  if (unsubscribeUrl) {
    lines.push("", `Sie möchten keine weiteren E-Mails von uns erhalten? Abmelden: ${unsubscribeUrl}`);
  }
  return lines.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Einfache, robuste HTML-Version aus Klartext (Absätze, Links). */
export function textToHtml(text: string): string {
  const linked = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  const paras = linked.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`);
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${paras.join("")}</body></html>`;
}

export function snippet(text: string | null | undefined, len = 160) {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > len ? `${t.slice(0, len - 1)}…` : t;
}
