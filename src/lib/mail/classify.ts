/**
 * Reine Funktionen zur Einordnung eingehender E-Mails (ohne I/O, gut testbar):
 * Unzustellbarkeitsberichte (DSN, RFC 3464), Abwesenheitsnotizen, Threading.
 */
export type InboundAttachment = { contentType: string; content: Buffer | string; filename?: string | null };

export type ParsedInbound = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: { address: string; name: string | null };
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string | null;
  date: Date | null;
  headers: Record<string, string>;
  attachments: InboundAttachment[];
};

export type BounceInfo = {
  isBounce: boolean;
  type: "hard" | "soft" | null;
  recipient: string | null;
  originalMessageId: string | null;
  statusCode: string | null;
  diagnostic: string | null;
};

const BOUNCE_SUBJECT =
  /(undeliver|delivery status notification|delivery failure|failure notice|returned mail|mail delivery (failed|subsystem)|unzustellbar|nicht zugestellt|zustellung fehlgeschlagen|unable to deliver|non[- ]?delivery)/i;
const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/i;

function asText(c: Buffer | string) {
  return typeof c === "string" ? c : c.toString("utf8");
}

function headerValue(block: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, "im");
  const m = block.match(re);
  return m ? m[1].replace(/\r?\n[ \t]+/g, " ").trim() : null;
}

export function normalizeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const m = id.match(/<[^>]+>/);
  return (m ? m[0] : `<${id.trim().replace(/^<|>$/g, "")}>`).toLowerCase();
}

export function detectBounce(p: ParsedInbound): BounceInfo {
  const none: BounceInfo = { isBounce: false, type: null, recipient: null, originalMessageId: null, statusCode: null, diagnostic: null };
  const ctype = (p.headers["content-type"] ?? "").toLowerCase();
  const isReport = ctype.includes("multipart/report") && ctype.includes("delivery-status");
  const dsnPart = p.attachments.find((a) => /message\/(global-)?delivery-status/i.test(a.contentType));
  const senderLooksLikeDaemon = BOUNCE_SENDER.test(p.from.address);
  const subjectLooksLikeBounce = BOUNCE_SUBJECT.test(p.subject);

  if (!isReport && !dsnPart && !(senderLooksLikeDaemon && subjectLooksLikeBounce) && !(senderLooksLikeDaemon && /\b5\.\d\.\d+\b/.test(p.text)))
    return none;

  let recipient: string | null = null;
  let statusCode: string | null = null;
  let diagnostic: string | null = null;

  if (dsnPart) {
    const t = asText(dsnPart.content);
    const finalRcpt = headerValue(t, "Final-Recipient") ?? headerValue(t, "Original-Recipient");
    recipient = finalRcpt ? finalRcpt.replace(/^rfc822;\s*/i, "").trim().toLowerCase() : null;
    statusCode = headerValue(t, "Status");
    diagnostic = headerValue(t, "Diagnostic-Code");
  }
  if (!statusCode) {
    const m = p.text.match(/\b([45])\.(\d{1,3})\.(\d{1,3})\b/);
    if (m) statusCode = m[0];
  }
  if (!recipient) {
    const m = p.text.match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?(?=[\s\S]{0,200}?(?:5\.\d\.\d|550|553|554|user unknown|does not exist|existiert nicht))/i);
    if (m) recipient = m[1].toLowerCase();
  }
  if (!diagnostic) {
    const m = p.text.match(/(5\d\d[ -][^\n]{5,200}|4\d\d[ -][^\n]{5,200})/);
    diagnostic = m ? m[1].trim() : null;
  }

  // Ursprüngliche Message-ID aus angehängter Originalnachricht bzw. deren Headern
  let originalMessageId: string | null = null;
  for (const a of p.attachments) {
    if (/message\/rfc822|text\/rfc822-headers|message\/global-headers/i.test(a.contentType)) {
      const id = headerValue(asText(a.content), "Message-ID");
      if (id) {
        originalMessageId = normalizeMessageId(id);
        break;
      }
    }
  }
  if (!originalMessageId) {
    const m = p.text.match(/^Message-ID:\s*(<[^>]+>)/im);
    if (m) originalMessageId = normalizeMessageId(m[1]);
  }

  const type: "hard" | "soft" = statusCode?.startsWith("4") ? "soft" : "hard";
  return { isBounce: true, type, recipient, originalMessageId, statusCode, diagnostic };
}

const AUTO_SUBJECT = /(abwesenheit|automatische antwort|out of (the )?office|autoreply|auto-reply|automatic reply|urlaub|nicht im büro|abwesend)/i;

export function detectAutoReply(p: ParsedInbound): boolean {
  const h = p.headers;
  const autoSubmitted = (h["auto-submitted"] ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"]?.toLowerCase().includes("all")) return true;
  const precedence = (h["precedence"] ?? "").toLowerCase();
  if (precedence === "auto_reply") return true;
  return AUTO_SUBJECT.test(p.subject);
}

/** Alle Message-IDs, über die eine Antwort einer gesendeten Nachricht zugeordnet werden kann. */
export function threadCandidates(p: ParsedInbound): string[] {
  const ids = [p.inReplyTo, ...p.references.slice().reverse()].map(normalizeMessageId).filter((x): x is string => !!x);
  return [...new Set(ids)];
}

/** Entfernt zitierte Vorgänger-Nachrichten, damit die KI-Analyse nur die neue Antwort sieht. */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^(am|on) .{5,120}(schrieb|wrote).{0,40}:?\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(ursprüngliche nachricht|original message)/i.test(line.trim())) break;
    if (/^(von|from):\s.+/i.test(line.trim()) && out.length > 2) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function subjectThreadKey(subject: string): string {
  return subject
    .replace(/^\s*((re|aw|wg|fwd?|antw)\s*(\[\d+\])?:\s*)+/gi, "")
    .trim()
    .toLowerCase();
}
