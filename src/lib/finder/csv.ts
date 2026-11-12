import Papa from "papaparse";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/lib/constants";
import { normalizeEmail } from "@/lib/normalize";

/** Spalten-Aliase (deutsch/englisch) → internes Feld. */
const ALIASES: Record<string, string[]> = {
  name: ["firma", "firmenname", "unternehmen", "company", "name", "company name", "organisation"],
  industry: ["branche", "industry", "kategorie", "category"],
  street: ["straße", "strasse", "adresse", "street", "address", "anschrift"],
  postalCode: ["plz", "postleitzahl", "zip", "postal code", "postcode"],
  city: ["ort", "stadt", "city"],
  district: ["stadtteil", "bezirk", "district", "quarter"],
  website: ["website", "webseite", "homepage", "url", "web"],
  phone: ["telefon", "tel", "phone", "telefonnummer"],
  email: ["e-mail", "email", "mail", "e-mail-adresse"],
  companySize: ["größe", "groesse", "unternehmensgröße", "company size", "size", "mitarbeiter"],
  notes: ["notiz", "notizen", "notes", "bemerkung"],
  contactSalutation: ["anrede", "salutation"],
  contactFirstName: ["vorname", "first name", "firstname"],
  contactLastName: ["nachname", "last name", "lastname", "name ansprechpartner"],
  contactPosition: ["position", "funktion", "rolle", "title", "job title"],
  contactEmail: ["e-mail ansprechpartner", "kontakt e-mail", "contact email", "ansprechpartner e-mail"],
  contactPhone: ["telefon ansprechpartner", "contact phone", "durchwahl"],
  tags: ["tags", "schlagwörter"],
  // Werbeerlaubnis darf nur mit Nachweis importiert werden
  consentBasis: ["einwilligung", "consent", "werbeerlaubnis"],
  consentDate: ["einwilligungsdatum", "consent date"],
  consentEvidence: ["einwilligungsnachweis", "consent evidence", "nachweis"],
};

export type CsvCompanyRow = {
  line: number;
  name: string;
  industry: IndustryKey;
  street?: string;
  postalCode?: string;
  city?: string;
  district?: string;
  website?: string;
  phone?: string;
  email?: string;
  companySize?: string;
  notes?: string;
  tags: string[];
  contact?: { salutation?: string; firstName?: string; lastName?: string; position?: string; email?: string; phone?: string };
  consent?: { basis: "express_consent" | "double_opt_in" | "existing_customer"; date: Date; evidence: string };
};

export type CsvParseResult = { rows: CsvCompanyRow[]; errors: { line: number; message: string }[]; mappedColumns: Record<string, string> };

function mapHeader(h: string): string | null {
  const k = h.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(ALIASES)) if (aliases.includes(k) || field.toLowerCase() === k) return field;
  return null;
}

export function industryFromText(v: string | undefined): IndustryKey {
  if (!v) return "other";
  const t = v.toLowerCase().trim();
  if ((INDUSTRY_KEYS as string[]).includes(t)) return t as IndustryKey;
  for (const [k, label] of Object.entries(INDUSTRIES)) if (label.toLowerCase() === t) return k as IndustryKey;
  if (/event|location|veranstalt|messe/.test(t)) return "event_agency";
  if (/agentur|werbung|marketing|media|medien|verlag|design|pr\b/.test(t)) return "agency";
  if (/kanzlei|anwalt|recht|steuer|notar|berat|consult|wirtschaftsprüf|architekt/.test(t)) return "consulting";
  if (/tech|software|start-?up|it\b|saas|digital/.test(t)) return "tech";
  if (/cowork|business ?center|büro ?center/.test(t)) return "coworking";
  if (/hotel|tagung|pension|hostel/.test(t)) return "hotel";
  if (/arzt|praxis|zahn|medizin|klinik|ärzt|krankenhaus/.test(t)) return "medical";
  if (/schule|bildung|akademie|hochschule|uni|weiterbildung/.test(t)) return "education";
  if (/fitness|gym|sport|wellness|yoga|spa/.test(t)) return "fitness";
  if (/handel|shop|laden|showroom|store|boutique|retail/.test(t)) return "retail";
  if (/büro|office|unternehmen|gmbh|firma|konzern|versicherung|bank/.test(t)) return "office";
  return "other";
}

function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  const de = v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const d = de ? new Date(Number(de[3]), Number(de[2]) - 1, Number(de[1])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseCompanyCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t"] });
  const mappedColumns: Record<string, string> = {};
  for (const h of parsed.meta.fields ?? []) {
    const f = mapHeader(h);
    if (f) mappedColumns[h] = f;
  }
  const rows: CsvCompanyRow[] = [];
  const errors: { line: number; message: string }[] = parsed.errors.map((e) => ({ line: (e.row ?? 0) + 2, message: e.message }));
  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const r: Record<string, string> = {};
    for (const [h, v] of Object.entries(raw)) {
      const f = mappedColumns[h];
      if (f && typeof v === "string" && v.trim()) r[f] = v.trim();
    }
    if (!r.name) {
      errors.push({ line, message: "Firmenname fehlt" });
      return;
    }
    if (r.postalCode && !/^\d{5}$/.test(r.postalCode)) {
      errors.push({ line, message: `Ungültige PLZ „${r.postalCode}“` });
      delete r.postalCode;
    }
    if (r.email && !normalizeEmail(r.email)) {
      errors.push({ line, message: `Ungültige E-Mail „${r.email}“ – ignoriert` });
      delete r.email;
    }
    const hasContact = r.contactFirstName || r.contactLastName || r.contactEmail;
    let consent: CsvCompanyRow["consent"];
    if (r.consentBasis) {
      const b = r.consentBasis.toLowerCase();
      const basis = /double|doi/.test(b) ? "double_opt_in" : /bestand|existing/.test(b) ? "existing_customer" : /ja|yes|einwillig|consent|true/.test(b) ? "express_consent" : null;
      const date = parseDate(r.consentDate);
      if (basis && date && r.consentEvidence) consent = { basis, date, evidence: r.consentEvidence };
      else if (basis) errors.push({ line, message: "Einwilligung ohne Datum/Nachweis – wird NICHT übernommen" });
    }
    rows.push({
      line,
      name: r.name,
      industry: industryFromText(r.industry),
      street: r.street,
      postalCode: r.postalCode,
      city: r.city,
      district: r.district,
      website: r.website,
      phone: r.phone,
      email: r.email,
      companySize: r.companySize,
      notes: r.notes,
      tags: r.tags ? r.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : [],
      contact: hasContact
        ? { salutation: r.contactSalutation, firstName: r.contactFirstName, lastName: r.contactLastName, position: r.contactPosition, email: normalizeEmail(r.contactEmail) ?? undefined, phone: r.contactPhone }
        : undefined,
      consent,
    });
  });
  return { rows, errors, mappedColumns };
}

export const CSV_TEMPLATE_HEADER =
  "Firma;Branche;Straße;PLZ;Ort;Stadtteil;Website;Telefon;E-Mail;Größe;Notizen;Anrede;Vorname;Nachname;Funktion;E-Mail Ansprechpartner;Telefon Ansprechpartner;Tags;Einwilligung;Einwilligungsdatum;Einwilligungsnachweis";
