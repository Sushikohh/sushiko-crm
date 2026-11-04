import { describe, expect, it } from "vitest";
import { evaluateCorrespondence, evaluateMarketingEligibility } from "@/lib/compliance";

const base = { email: "anna@firma.de", suppressed: false, senderIdentityComplete: true };
const consent = { basis: "express_consent" as const, grantedAt: new Date("2026-01-10"), revokedAt: null, evidence: "Schriftliche Einwilligung, Scan DMS-123", doiConfirmedAt: null };

describe("evaluateMarketingEligibility", () => {
  it("verweigert ohne Einwilligung – auch bei öffentlicher Geschäftsadresse", () => {
    const r = evaluateMarketingEligibility({ ...base, permission: null });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain("Keine nachgewiesene Werbeeinwilligung");
  });

  it("erlaubt bei dokumentierter ausdrücklicher Einwilligung", () => {
    expect(evaluateMarketingEligibility({ ...base, permission: consent }).allowed).toBe(true);
  });

  it("verlangt Nachweis und Datum der Einwilligung", () => {
    const r = evaluateMarketingEligibility({ ...base, permission: { ...consent, evidence: " ", grantedAt: null } });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining(["Nachweis der Einwilligung fehlt", "Zeitpunkt der Einwilligung fehlt"]));
  });

  it("Double-Opt-in nur nach Bestätigung", () => {
    const doi = { ...consent, basis: "double_opt_in" as const };
    expect(evaluateMarketingEligibility({ ...base, permission: doi }).allowed).toBe(false);
    expect(evaluateMarketingEligibility({ ...base, permission: { ...doi, doiConfirmedAt: new Date() } }).allowed).toBe(true);
  });

  it("Bestandskunde nur mit Dokumentation (§ 7 Abs. 3 UWG)", () => {
    const ec = { ...consent, basis: "existing_customer" as const, evidence: null };
    expect(evaluateMarketingEligibility({ ...base, permission: ec }).allowed).toBe(false);
  });

  it("Sperrliste, Widerspruch, Status ‚gesperrt‘ und fehlendes Impressum blockieren", () => {
    expect(evaluateMarketingEligibility({ ...base, permission: consent, suppressed: true }).allowed).toBe(false);
    expect(evaluateMarketingEligibility({ ...base, permission: { ...consent, basis: "objected" } }).allowed).toBe(false);
    expect(evaluateMarketingEligibility({ ...base, permission: consent, contactStatus: "blocked" }).allowed).toBe(false);
    expect(evaluateMarketingEligibility({ ...base, permission: consent, senderIdentityComplete: false }).allowed).toBe(false);
    expect(evaluateMarketingEligibility({ ...base, permission: { ...consent, revokedAt: new Date() } }).allowed).toBe(false);
  });

  it("ungültige Adresse", () => {
    expect(evaluateMarketingEligibility({ ...base, email: "kein-at", permission: consent }).allowed).toBe(false);
  });
});

describe("evaluateCorrespondence", () => {
  it("erlaubt Antworten auch an gesperrte Adressen, aber keine neuen Nachrichten", () => {
    expect(evaluateCorrespondence({ email: "a@b.de", suppressed: true, isReply: true }).allowed).toBe(true);
    expect(evaluateCorrespondence({ email: "a@b.de", suppressed: true, isReply: false }).allowed).toBe(false);
    expect(evaluateCorrespondence({ email: "a@b.de", suppressed: false, isReply: false }).allowed).toBe(true);
  });
});
