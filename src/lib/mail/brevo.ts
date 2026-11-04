import { env } from "@/lib/env";
import type { OutgoingMail, SendResult } from "./smtp";

/**
 * Brevo Transactional API (https://developers.brevo.com/reference/sendtransacemail).
 * Nur für Kampagnen mit nachgewiesener Werbeerlaubnis vorgesehen.
 */
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export function brevoConfigured() {
  return !!env.BREVO_API_KEY;
}

export class BrevoError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
  get permanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

export async function sendBrevo(mail: OutgoingMail): Promise<SendResult> {
  if (!env.BREVO_API_KEY) throw new BrevoError("Brevo ist nicht verbunden (BREVO_API_KEY fehlt).", 400);
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: mail.from.name ?? undefined, email: mail.from.address },
      to: mail.to.map((email) => ({ email })),
      cc: mail.cc?.length ? mail.cc.map((email) => ({ email })) : undefined,
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
      headers: {
        ...mail.headers,
        "Message-ID": mail.messageId,
        ...(mail.inReplyTo ? { "In-Reply-To": mail.inReplyTo } : {}),
        ...(mail.references ? { References: mail.references } : {}),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
  if (!res.ok) throw new BrevoError(`Brevo ${res.status}: ${body.message ?? body.code ?? "Unbekannter Fehler"}`, res.status);
  return {
    accepted: mail.to,
    rejected: [],
    response: `Brevo 201 ${body.messageId ?? ""}`.trim(),
    messageId: mail.messageId,
    providerMessageId: body.messageId,
  };
}

/** Abbildung der Brevo-Webhook-Ereignisse auf interne Typen. */
export function mapBrevoEvent(event: string): "delivered" | "hard_bounce" | "soft_bounce" | "unsubscribed" | "complaint" | "blocked" | "opened" | "clicked" | "deferred" | "other" {
  switch (event) {
    case "delivered":
      return "delivered";
    case "hard_bounce":
    case "hardBounce":
    case "invalid_email":
      return "hard_bounce";
    case "soft_bounce":
    case "softBounce":
      return "soft_bounce";
    case "unsubscribed":
    case "unsubscribe":
      return "unsubscribed";
    case "spam":
    case "complaint":
      return "complaint";
    case "blocked":
      return "blocked";
    case "deferred":
      return "deferred";
    case "opened":
    case "unique_opened":
      return "opened";
    case "click":
      return "clicked";
    default:
      return "other";
  }
}
