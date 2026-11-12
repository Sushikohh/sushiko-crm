import type { IndustryKey } from "./constants";

/**
 * Regelbasierte Potenzialbewertung (0–100) für B2B-Sushi-Catering.
 * Kriterien: Branche (Event- und Bewirtungskultur), Größe (Mitarbeitende, Gästezahl bei Events),
 * mehrere Standorte, bekannter Entscheider, Erreichbarkeit, Liefergebiet Hamburg.
 * Transparent und pro Firma manuell überschreibbar.
 */
const INDUSTRY_WEIGHT: Record<IndustryKey, number> = {
  event_agency: 30, // vermitteln laufend Events → Multiplikator
  agency: 26, // Pitches, Kundentermine, Team-Events
  consulting: 26, // Mandanten-Events, Meetings mit Bewirtung
  tech: 24, // Team-Lunches, Offsites, Recruiting-Events
  office: 22,
  coworking: 22, // Community-Events, viele Firmen unter einem Dach
  hotel: 18, // Tagungen, Zusatzangebot
  education: 14,
  medical: 12,
  retail: 12, // Store-Openings, Showroom-Events
  fitness: 10,
  other: 8,
};

export type ScoreInput = {
  industry: IndustryKey;
  employeeCount?: number | null;
  eventGuests?: number | null;
  companySize?: string | null;
  hasWebsite: boolean;
  hasPhone: boolean;
  contactCount: number;
  hasDecisionMaker: boolean;
  locationCount: number;
  city?: string | null;
};

export type ScoreBreakdown = { score: number; factors: { label: string; points: number }[] };

export function scoreCompany(i: ScoreInput): ScoreBreakdown {
  const factors: { label: string; points: number }[] = [];
  factors.push({ label: "Branche", points: INDUSTRY_WEIGHT[i.industry] ?? 8 });

  let size = 0;
  if (i.employeeCount) size = i.employeeCount >= 200 ? 22 : i.employeeCount >= 50 ? 17 : i.employeeCount >= 15 ? 11 : 5;
  else if (i.companySize) size = /gro(ß|ss)|large|250|500|1000/i.test(i.companySize) ? 20 : /mittel|medium|50/i.test(i.companySize) ? 14 : 7;
  factors.push({ label: "Mitarbeitende", points: size });
  factors.push({ label: "Gästezahl bei Events", points: i.eventGuests ? (i.eventGuests >= 80 ? 10 : i.eventGuests >= 30 ? 7 : 4) : 0 });

  factors.push({ label: "Mehrere Standorte", points: Math.min(8, Math.max(0, i.locationCount - 1) * 4) });
  factors.push({ label: "Ansprechpartner bekannt", points: i.contactCount > 0 ? (i.hasDecisionMaker ? 15 : 9) : 0 });
  factors.push({ label: "Erreichbarkeit", points: (i.hasWebsite ? 3 : 0) + (i.hasPhone ? 3 : 0) });
  factors.push({ label: "Liefergebiet Hamburg", points: !i.city || /hamburg/i.test(i.city) ? 10 : 3 });

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { score, factors };
}

export function potentialLabel(score: number): { label: string; tone: string } {
  if (score >= 70) return { label: "A – hoch", tone: "green" };
  if (score >= 45) return { label: "B – mittel", tone: "amber" };
  return { label: "C – niedrig", tone: "slate" };
}

/** Typische Entscheider für Catering-Bestellungen. */
export const DECISION_MAKER_PATTERN =
  /(office|assistenz|assistant|empfang|event|veranstaltung|hr\b|people|personal|culture|marketing|geschäftsf|inhaber|leitung|leiter|einkauf|ceo|owner|founder|gründer|director|manager|team ?lead|feel ?good|community)/i;
