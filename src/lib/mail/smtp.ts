import nodemailer from "nodemailer";
import type { SmtpConfig } from "./mailbox";

export type OutgoingMail = {
  from: { name?: string | null; address: string };
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
  headers?: Record<string, string>;
};

export type SendResult = {
  accepted: string[];
  rejected: string[];
  response: string;
  messageId: string;
  providerMessageId?: string;
};

export function createSmtpTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // Port 465: implizites TLS. Port 587: STARTTLS wird erzwungen (requireTLS).
    secure: cfg.secure,
    requireTLS: !cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

export async function verifySmtp(cfg: SmtpConfig) {
  const t = createSmtpTransport(cfg);
  try {
    await t.verify();
  } finally {
    t.close();
  }
}

/** Sendet per SMTP. "accepted" bedeutet: vom Empfängerserver (bzw. Relay) mit 2xx angenommen. */
export async function sendSmtp(cfg: SmtpConfig, mail: OutgoingMail): Promise<SendResult> {
  const t = createSmtpTransport(cfg);
  try {
    const info = await t.sendMail({
      from: mail.from.name ? { name: mail.from.name, address: mail.from.address } : mail.from.address,
      to: mail.to,
      cc: mail.cc,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      messageId: mail.messageId,
      inReplyTo: mail.inReplyTo ?? undefined,
      references: mail.references ?? undefined,
      headers: mail.headers,
    });
    const norm = (list: unknown[] | undefined) =>
      (list ?? []).map((a) => (typeof a === "string" ? a : ((a as { address?: string }).address ?? ""))).filter(Boolean);
    return {
      accepted: norm(info.accepted as unknown[]),
      rejected: norm(info.rejected as unknown[]),
      response: String(info.response ?? ""),
      messageId: info.messageId ?? mail.messageId,
    };
  } finally {
    t.close();
  }
}

/** SMTP-Fehler klassifizieren: permanente (5xx) Fehler nicht wiederholen. */
export function isPermanentSmtpError(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string };
  return typeof e?.responseCode === "number" && e.responseCode >= 500 && e.responseCode < 600 && e.code !== "EAUTH";
}
