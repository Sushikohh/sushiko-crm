import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Provider-unabhängige KI-Schicht. Alle Aufrufe laufen serverseitig,
 * Ausgaben werden mit Zod validiert. Ohne API-Schlüssel: Status „Nicht verbunden“.
 */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("KI ist nicht verbunden. Bitte ANTHROPIC_API_KEY oder OPENAI_API_KEY setzen.");
  }
}
export class AiRefusalError extends Error {}

export function aiStatus() {
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) return { connected: true, provider: "Anthropic", model: env.ANTHROPIC_MODEL };
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) return { connected: true, provider: "OpenAI", model: env.OPENAI_MODEL };
  return { connected: false, provider: env.AI_PROVIDER === "none" ? "Deaktiviert" : env.AI_PROVIDER, model: null as string | null };
}

let anthropic: Anthropic | null = null;
function anthropicClient() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return anthropic;
}

type Effort = "low" | "medium" | "high";

async function structured<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const status = aiStatus();
  if (!status.connected) throw new AiNotConfiguredError();

  if (env.AI_PROVIDER === "anthropic") {
    const res = await anthropicClient().beta.messages.parse({
      model: env.ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
      // Serverseitiger Fallback bei Ablehnung durch Sicherheitsklassifikatoren
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new AiRefusalError("Die KI hat die Anfrage abgelehnt.");
    if (res.stop_reason === "max_tokens") throw new Error("KI-Antwort wurde abgeschnitten (max_tokens).");
    if (!res.parsed_output) throw new Error("KI-Antwort konnte nicht validiert werden.");
    return opts.schema.parse(res.parsed_output);
  }

  // OpenAI (Chat Completions mit JSON-Schema)
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });
  const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema: jsonSchema } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string | null; refusal?: string | null } }[] };
  const msg = data.choices[0]?.message;
  if (msg?.refusal) throw new AiRefusalError(msg.refusal);
  return opts.schema.parse(JSON.parse(msg?.content ?? "{}"));
}

/* ------------------------------------------------------------------ */
/* Antwortanalyse                                                      */
/* ------------------------------------------------------------------ */

export const replyAnalysisSchema = z.object({
  category: z.enum([
    "interested",
    "meeting_request",
    "question",
    "later",
    "not_interested",
    "unsubscribe",
    "out_of_office",
    "wrong_person",
    "other",
  ]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().describe("Zahl zwischen 0 und 1"),
  summary: z.string().describe("Zusammenfassung in 1–2 Sätzen auf Deutsch"),
  objectToMarketing: z.boolean().describe("true, wenn der Absender weiteren Werbe-E-Mails widerspricht"),
  requestedCallback: z.boolean(),
  proposedDates: z.array(z.string()).describe("Genannte Terminvorschläge im Originalwortlaut"),
  followUpDate: z.string().nullable().describe("ISO-Datum (YYYY-MM-DD), falls ein späterer Kontaktzeitpunkt genannt wird, sonst null"),
  alternativeContact: z.string().nullable().describe("Genannter alternativer Ansprechpartner inkl. E-Mail, sonst null"),
  nextAction: z.string().describe("Empfohlener nächster Schritt für den Vertrieb (Deutsch, kurz)"),
});
export type ReplyAnalysis = z.infer<typeof replyAnalysisSchema>;

const ANALYSIS_SYSTEM = `Du analysierst eingehende E-Mail-Antworten für den B2B-Vertrieb eines Sushi-Catering-Unternehmens in Hamburg (Firmenevents, Meetings, Team-Lunches).
Ordne die Antwort genau einer Kategorie zu:
- interested: grundsätzliches Interesse, möchte Informationen, Speisekarte oder ein Angebot (z. B. für ein Event)
- meeting_request: nennt einen konkreten Event-/Liefertermin, wünscht Verkostung, Gespräch oder Rückruf
- question: stellt eine inhaltliche Rückfrage ohne klare Interessensbekundung
- later: aktuell kein Bedarf, aber später erneut melden (z. B. nächste Weihnachtsfeier, anderer Caterer gebucht)
- not_interested: kein Interesse
- unsubscribe: möchte keine weiteren E-Mails / widerspricht Werbung / Datenlöschung
- out_of_office: Abwesenheitsnotiz
- wrong_person: falscher Ansprechpartner, verweist ggf. auf andere Person
- other: alles andere
Setze objectToMarketing=true bei jedem Wunsch, keine weiteren E-Mails zu erhalten, auch wenn höflich formuliert.
Erfinde keine Informationen. Antworte ausschließlich im vorgegebenen Format.`;

export async function analyzeReply(input: {
  subject: string;
  body: string;
  companyName?: string | null;
  originalSubject?: string | null;
  today?: string;
}): Promise<ReplyAnalysis> {
  const prompt = [
    `Heutiges Datum: ${input.today ?? new Date().toISOString().slice(0, 10)}`,
    input.companyName ? `Unternehmen des Absenders: ${input.companyName}` : null,
    input.originalSubject ? `Betreff unserer ursprünglichen E-Mail: ${input.originalSubject}` : null,
    `Betreff der Antwort: ${input.subject}`,
    "Text der Antwort (ohne Zitate):",
    "<antwort>",
    input.body.slice(0, 12000),
    "</antwort>",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await structured({ system: ANALYSIS_SYSTEM, prompt, schema: replyAnalysisSchema, effort: "low" });
  return { ...result, confidence: Math.max(0, Math.min(1, result.confidence)) };
}

/* ------------------------------------------------------------------ */
/* E-Mail-Personalisierung und Antwortentwürfe                         */
/* ------------------------------------------------------------------ */

export const emailDraftSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Nur Klartext, ohne Signatur und ohne Impressum"),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;

const WRITER_SYSTEM = `Du schreibst geschäftliche E-Mails auf Deutsch für Sushiko, ein Sushi-Catering für Firmenkunden in Hamburg.
Stil: herzlich, professionell, konkret, kurz (max. 150 Wörter), Sie-Form, keine Übertreibungen, keine erfundenen Referenzen,
Preise, Gerichte, Zertifikate oder Rabatte. Keine Signatur und kein Impressum anhängen – das ergänzt das System.`;

export async function personalizeEmail(input: {
  subject: string;
  body: string;
  company: { name: string; industry: string; district?: string | null; website?: string | null; notes?: string | null };
  contact: { name: string; position?: string | null };
}): Promise<EmailDraft> {
  const prompt = `Passe die folgende Vorlage leicht an den Empfänger an. Behalte Kernaussage, Angebot und Länge bei.
Nutze ausschließlich die gegebenen Fakten.

Empfänger: ${input.contact.name}${input.contact.position ? ` (${input.contact.position})` : ""}
Unternehmen: ${input.company.name} – Branche: ${input.company.industry}${input.company.district ? ` – Stadtteil: ${input.company.district}` : ""}
${input.company.notes ? `Interne Notizen: ${input.company.notes.slice(0, 1000)}` : ""}

<betreff>${input.subject}</betreff>
<vorlage>
${input.body}
</vorlage>`;
  return structured({ system: WRITER_SYSTEM, prompt, schema: emailDraftSchema, effort: "low" });
}

export async function draftReply(input: {
  thread: { from: string; date: string; body: string }[];
  analysis?: ReplyAnalysis | null;
  senderName: string;
  instructions?: string;
}): Promise<EmailDraft> {
  const history = input.thread
    .slice(-6)
    .map((m) => `<nachricht von="${m.from}" datum="${m.date}">\n${m.body.slice(0, 4000)}\n</nachricht>`)
    .join("\n");
  const prompt = `Verfasse eine Antwort auf die letzte Nachricht im Verlauf im Namen von ${input.senderName}.
${input.analysis ? `Einordnung: ${input.analysis.category} – ${input.analysis.summary}` : ""}
${input.instructions ? `Zusätzliche Hinweise: ${input.instructions}` : ""}
Wenn ein Event oder eine Bestellung angefragt wird, bestätige freundlich und frage gezielt nach fehlenden Angaben: Datum, Uhrzeit, Personenzahl, Lieferadresse, vegetarische/vegane Wünsche und Allergien. Nenne keine Preise, die nicht im Verlauf stehen.
Wenn die Person keine E-Mails mehr wünscht, bestätige nur kurz und höflich die Abmeldung.

${history}`;
  return structured({ system: WRITER_SYSTEM, prompt, schema: emailDraftSchema, effort: "medium" });
}

export async function safeAi<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    logger.warn("KI-Aufruf fehlgeschlagen", { err });
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter KI-Fehler" };
  }
}
