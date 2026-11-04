import { describe, expect, it } from "vitest";
import { simpleParser } from "mailparser";
import { detectAutoReply, detectBounce, normalizeMessageId, stripQuoted, subjectThreadKey, threadCandidates } from "@/lib/mail/classify";
import { toParsedInbound } from "@/lib/mail/imap";
import { detectOptOut } from "@/lib/services/inbox";

const DSN = [
  "From: Mail Delivery System <MAILER-DAEMON@mx.example.org>",
  "To: info@reinigung.de",
  "Subject: Undelivered Mail Returned to Sender",
  "Message-ID: <dsn-1@mx.example.org>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"',
  "",
  "--BOUND",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "This is the mail system. Your message could not be delivered.",
  "",
  "--BOUND",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns; mx.example.org",
  "",
  "Final-Recipient: rfc822; gibtsnicht@kunde.de",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp; 550 5.1.1 User unknown",
  "",
  "--BOUND",
  "Content-Type: text/rfc822-headers",
  "",
  "From: info@reinigung.de",
  "To: gibtsnicht@kunde.de",
  "Subject: Reinigung",
  "Message-ID: <ABC-123@reinigung.de>",
  "",
  "--BOUND--",
  "",
].join("\r\n");

describe("detectBounce", () => {
  it("erkennt DSN (RFC 3464) inkl. Empfänger, Status und ursprünglicher Message-ID", async () => {
    const p = toParsedInbound(await simpleParser(DSN));
    const b = detectBounce(p);
    expect(b.isBounce).toBe(true);
    expect(b.type).toBe("hard");
    expect(b.recipient).toBe("gibtsnicht@kunde.de");
    expect(b.statusCode).toBe("5.1.1");
    expect(b.originalMessageId).toBe("<abc-123@reinigung.de>");
  });

  it("normale Antwort ist kein Bounce", async () => {
    const p = toParsedInbound(await simpleParser("From: a@kunde.de\r\nTo: info@reinigung.de\r\nSubject: Re: Angebot\r\nIn-Reply-To: <x@reinigung.de>\r\n\r\nGerne, rufen Sie mich an.\r\n"));
    expect(detectBounce(p).isBounce).toBe(false);
    expect(detectAutoReply(p)).toBe(false);
    expect(threadCandidates(p)).toEqual(["<x@reinigung.de>"]);
  });
});

describe("detectAutoReply", () => {
  it("erkennt Auto-Submitted und typische Betreffzeilen", async () => {
    const a = toParsedInbound(await simpleParser("From: a@kunde.de\r\nAuto-Submitted: auto-replied\r\nSubject: Re: Hallo\r\n\r\nBin weg\r\n"));
    const b = toParsedInbound(await simpleParser("From: a@kunde.de\r\nSubject: Abwesenheitsnotiz: Re: Hallo\r\n\r\nBin weg\r\n"));
    expect(detectAutoReply(a)).toBe(true);
    expect(detectAutoReply(b)).toBe(true);
  });
});

describe("Hilfsfunktionen", () => {
  it("normalisiert Message-IDs", () => {
    expect(normalizeMessageId("ABC@Host.de")).toBe("<abc@host.de>");
    expect(normalizeMessageId(" <X@y> ")).toBe("<x@y>");
  });
  it("entfernt Zitate", () => {
    const t = "Ja, gerne!\n\nAm 03.11.2026 um 10:00 schrieb Max <max@x.de>:\n> Hallo\n> Text";
    expect(stripQuoted(t)).toBe("Ja, gerne!");
  });
  it("Thread-Schlüssel aus Betreff", () => {
    expect(subjectThreadKey("AW: Re: WG: Angebot")).toBe("angebot");
  });
  it("erkennt Abmeldewünsche regelbasiert", () => {
    expect(detectOptOut("Bitte keine weiteren E-Mails senden.")).toBe(true);
    expect(detectOptOut("Bitte nehmen Sie uns aus dem Verteiler.")).toBe(true);
    expect(detectOptOut("Ich widerspreche der Nutzung meiner Daten")).toBe(true);
    expect(detectOptOut("Gerne können Sie uns ein Angebot schicken.")).toBe(false);
  });
});
