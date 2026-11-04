import type { IndustryKey } from "./constants";

/**
 * Regelbasierte Potenzialbewertung (0–100) für Reinigungsverträge.
 * Transparent und nachvollziehbar; kann pro Firma manuell überschrieben werden.
 */
const INDUSTRY_WEIGHT: Record<IndustryKey, number> = {
  property_management: 30, // verwaltet viele Objekte → Hebel für mehrere Verträge
  commercial_property: 28,
  business_park: 28,
  office: 24,
  medical: 24, // hohe Hygieneanforderungen, regelmäßige Reinigung
  daycare: 22,
  education: 22,
  fitness: 20,
  hotel: 20,
  logistics: 16,
  retail: 14,
  other: 8,
};

export type ScoreInput = {
  industry: IndustryKey;
  employeeCount?: number | null;
  areaSqm?: number | null;
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
  if (i.areaSqm) size = i.areaSqm >= 2000 ? 25 : i.areaSqm >= 800 ? 18 : i.areaSqm >= 300 ? 12 : 6;
  else if (i.employeeCount) size = i.employeeCount >= 100 ? 22 : i.employeeCount >= 30 ? 16 : i.employeeCount >= 10 ? 10 : 5;
  else if (i.companySize) size = /gro(ß|ss)|large|250|500|1000/i.test(i.companySize) ? 20 : /mittel|medium|50/i.test(i.companySize) ? 14 : 7;
  factors.push({ label: "Größe / Fläche", points: size });

  factors.push({ label: "Mehrere Standorte", points: Math.min(10, Math.max(0, i.locationCount - 1) * 5) });
  factors.push({ label: "Ansprechpartner bekannt", points: i.contactCount > 0 ? (i.hasDecisionMaker ? 15 : 9) : 0 });
  factors.push({ label: "Erreichbarkeit", points: (i.hasWebsite ? 5 : 0) + (i.hasPhone ? 5 : 0) });
  factors.push({ label: "Standort Hamburg", points: !i.city || /hamburg/i.test(i.city) ? 10 : 4 });

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { score, factors };
}

export function potentialLabel(score: number): { label: string; tone: string } {
  if (score >= 70) return { label: "A – hoch", tone: "green" };
  if (score >= 45) return { label: "B – mittel", tone: "amber" };
  return { label: "C – niedrig", tone: "slate" };
}

export const DECISION_MAKER_PATTERN = /(geschäftsf|inhaber|leitung|leiter|facility|objekt|hausverwalt|verwalter|einkauf|ceo|owner|director|manager|praxisinhaber|betreiber|vorstand)/i;
