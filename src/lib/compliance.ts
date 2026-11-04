import { PERMISSION_BASIS, type PermissionBasisKey } from "./constants";
import { normalizeEmail } from "./normalize";

/**
 * Rechtliche Versandprüfung für Werbe-E-Mails (UWG § 7 Abs. 2 Nr. 2, Abs. 3; DSGVO Art. 7).
 *
 * Grundsatz: Werbung per E-Mail ist – auch im B2B-Bereich – nur mit vorheriger ausdrücklicher
 * Einwilligung zulässig. Ausnahme: Bestandskunden nach § 7 Abs. 3 UWG (alle Voraussetzungen
 * müssen erfüllt und dokumentiert sein). Eine öffentlich auffindbare Adresse genügt NICHT.
 *
 * Diese Funktion ist bewusst rein (ohne I/O) und wird sowohl in der UI (Vorschau) als auch
 * unmittelbar vor jedem Versand im Worker ausgeführt.
 */
export type PermissionRecord = {
  basis: PermissionBasisKey;
  grantedAt: Date | null;
  revokedAt: Date | null;
  evidence: string | null;
  doiConfirmedAt: Date | null;
};

export type EligibilityInput = {
  email: string | null | undefined;
  permission: PermissionRecord | null;
  suppressed: boolean;
  contactStatus?: string | null;
  companyStatus?: string | null;
  senderIdentityComplete: boolean;
};

export type EligibilityResult = { allowed: boolean; reasons: string[]; basis: PermissionBasisKey };

export function evaluateMarketingEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const basis: PermissionBasisKey = input.permission?.basis ?? "none";
  const email = normalizeEmail(input.email);

  if (!email) reasons.push("Keine gültige E-Mail-Adresse");
  if (input.suppressed) reasons.push("Adresse steht auf der Sperrliste");
  if (input.contactStatus === "blocked" || input.companyStatus === "blocked") reasons.push("Kontakt ist für Werbung gesperrt");
  if (!input.senderIdentityComplete) reasons.push("Absenderangaben (Impressum) in den Einstellungen unvollständig");

  const p = input.permission;
  if (!p || !PERMISSION_BASIS[basis].allowsMarketing) {
    reasons.push(
      basis === "objected" || basis === "revoked"
        ? "Werbewiderspruch bzw. Widerruf liegt vor"
        : "Keine nachgewiesene Werbeeinwilligung",
    );
  } else {
    if (p.revokedAt) reasons.push("Einwilligung wurde widerrufen");
    if (basis === "express_consent") {
      if (!p.grantedAt) reasons.push("Zeitpunkt der Einwilligung fehlt");
      if (!p.evidence?.trim()) reasons.push("Nachweis der Einwilligung fehlt");
    }
    if (basis === "double_opt_in" && !p.doiConfirmedAt) reasons.push("Double-Opt-in noch nicht bestätigt");
    if (basis === "existing_customer" && !p.evidence?.trim())
      reasons.push("Dokumentation der Voraussetzungen nach § 7 Abs. 3 UWG fehlt");
  }

  return { allowed: reasons.length === 0, reasons, basis };
}

/** Geschäftliche Einzelkorrespondenz (z. B. Antwort auf eine Anfrage) – keine Werbung. */
export function evaluateCorrespondence(input: { email: string | null | undefined; suppressed: boolean; isReply: boolean }) {
  const reasons: string[] = [];
  if (!normalizeEmail(input.email)) reasons.push("Keine gültige E-Mail-Adresse");
  // Bei aktiver Sperre (Widerspruch) nur noch Antworten auf eingehende Nachrichten zulassen.
  if (input.suppressed && !input.isReply) reasons.push("Adresse steht auf der Sperrliste – nur Antworten auf eingehende Nachrichten erlaubt");
  return { allowed: reasons.length === 0, reasons };
}
