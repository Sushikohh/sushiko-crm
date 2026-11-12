import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { parseCompanyCsv } from "@/lib/finder/csv";
import { buildOverpassQuery, mapOverpassElements } from "@/lib/finder/osm";
import { extractDomain, normalizeCompanyName, similarity } from "@/lib/normalize";
import { scoreCompany } from "@/lib/scoring";
import { findUnknownVariables, legalFooterText, letterSalutation, renderTemplate, templateValues } from "@/lib/templates";
import { inSendWindow, startOfBerlinDay } from "@/lib/services/campaigns";

describe("normalize", () => {
  it("entfernt Rechtsformen und Umlaute", () => {
    expect(normalizeCompanyName("Müller Hausverwaltung GmbH & Co. KG")).toBe("mueller hausverwaltung");
    expect(normalizeCompanyName("Praxis Dr. Schäfer")).toBe("praxis dr schaefer");
  });
  it("Domain-Extraktion", () => {
    expect(extractDomain("https://www.beispiel.de/kontakt")).toBe("beispiel.de");
    expect(extractDomain("info@beispiel.de")).toBe("beispiel.de");
  });
  it("Ähnlichkeit", () => {
    expect(similarity("alster hausverwaltung", "alster hausverwaltungen")).toBeGreaterThan(0.7);
    expect(similarity("alster hausverwaltung", "fitness park")).toBeLessThan(0.2);
  });
});

describe("templates", () => {
  const ctx = {
    contact: { salutation: "Frau", firstName: "Erika", lastName: "Muster" },
    company: { name: "Muster GmbH", district: "Altona", industry: "office" },
    sender: { name: "Max", company: "Glanz GmbH" },
  };
  it("rendert Platzhalter inkl. Fallback", () => {
    const v = templateValues(ctx);
    expect(renderTemplate("{{anrede}}, Firma {{firma}} in {{stadtteil}} {{position|(ohne)}}", v)).toBe("Sehr geehrte Frau Muster, Firma Muster GmbH in Altona (ohne)");
  });
  it("Anrede ohne Namen", () => {
    expect(letterSalutation({})).toBe("Sehr geehrte Damen und Herren");
  });
  it("erkennt unbekannte Platzhalter", () => {
    expect(findUnknownVariables("Hallo {{vorname}} {{foo}}")).toEqual(["foo"]);
  });
  it("Footer enthält Impressum und Abmeldelink", () => {
    const t = legalFooterText({ companyName: "Glanz", legalForm: "GmbH", street: "Hauptstr. 1", postalCode: "20095", city: "Hamburg" }, "https://x/u/abc");
    expect(t).toContain("Glanz GmbH");
    expect(t).toContain("20095 Hamburg");
    expect(t).toContain("https://x/u/abc");
  });
});

describe("crypto", () => {
  it("verschlüsselt und entschlüsselt (AES-256-GCM)", () => {
    const enc = encryptSecret("geheim!");
    expect(enc).not.toContain("geheim");
    expect(decryptSecret(enc)).toBe("geheim!");
  });
});

describe("CSV-Import", () => {
  it("erkennt deutsche Spalten, prüft PLZ und übernimmt Einwilligung nur mit Nachweis", () => {
    const csv = [
      "Firma;Branche;PLZ;Ort;E-Mail Ansprechpartner;Vorname;Nachname;Einwilligung;Einwilligungsdatum;Einwilligungsnachweis",
      "Alster Werbung GmbH;Werbeagentur;20095;Hamburg;a@alster.de;Anna;Alster;ja;12.03.2026;Formular Website",
      "Praxis Nord;Arztpraxis;2009;Hamburg;;;;ja;;",
      ";Kita;22765;Hamburg;;;;;;",
    ].join("\n");
    const r = parseCompanyCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].industry).toBe("agency");
    expect(r.rows[0].consent?.basis).toBe("express_consent");
    expect(r.rows[1].industry).toBe("medical");
    expect(r.rows[1].postalCode).toBeUndefined();
    expect(r.rows[1].consent).toBeUndefined();
    expect(r.errors.map((e) => e.message)).toEqual(expect.arrayContaining(["Firmenname fehlt", "Ungültige PLZ „2009“", "Einwilligung ohne Datum/Nachweis – wird NICHT übernommen"]));
  });
});

describe("OpenStreetMap", () => {
  it("baut Overpass-Abfrage für Stadtteil und Branche", () => {
    const q = buildOverpassQuery({ industry: "coworking", quarter: "Ottensen", name: "Sonne" });
    expect(q).toContain('area["ISO3166-2"="DE-HH"]');
    expect(q).toContain('["name"="Ottensen"]');
    expect(q).toContain('["amenity"~"^(coworking_space)$"]');
    expect(q).toContain('["name"~"Sonne",i]');
  });
  it("mappt Elemente und erkennt Branche", () => {
    const r = mapOverpassElements(
      [
        { type: "node", id: 1, lat: 53.5, lon: 9.9, tags: { name: "Hausarztpraxis X", amenity: "doctors", "addr:street": "Bahrenfelder Str.", "addr:housenumber": "5", "addr:postcode": "22765", website: "https://x.de" } },
        { type: "way", id: 2, center: { lat: 1, lon: 2 }, tags: { amenity: "doctors" } },
      ],
      "all",
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ sourceRef: "node/1", industry: "medical", street: "Bahrenfelder Str. 5", postalCode: "22765" });
  });
});

describe("Scoring", () => {
  it("Agentur mit Office-Managerin, 80 Mitarbeitenden und Events ist A-Potenzial", () => {
    const s = scoreCompany({ industry: "agency", employeeCount: 80, eventGuests: 60, hasWebsite: true, hasPhone: true, contactCount: 1, hasDecisionMaker: true, locationCount: 2, city: "Hamburg" });
    expect(s.score).toBeGreaterThanOrEqual(70);
  });
});

describe("Versandfenster (Europe/Berlin)", () => {
  const c = { sendWindowStart: 8, sendWindowEnd: 17, sendWeekdaysOnly: true };
  it("Dienstag 10:00 MEZ ist im Fenster, Samstag nicht, 18:00 nicht", () => {
    expect(inSendWindow(c, new Date("2026-11-03T09:00:00Z"))).toBe(true);
    expect(inSendWindow(c, new Date("2026-11-07T09:00:00Z"))).toBe(false);
    expect(inSendWindow(c, new Date("2026-11-03T17:30:00Z"))).toBe(false);
  });
  it("Tagesbeginn berücksichtigt Sommerzeit", () => {
    expect(startOfBerlinDay(new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(startOfBerlinDay(new Date("2026-11-04T12:00:00Z")).toISOString()).toBe("2026-11-03T23:00:00.000Z");
  });
});
