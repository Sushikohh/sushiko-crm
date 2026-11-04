import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("postgres://crm:crm@localhost:5432/crm"),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),

  AUTH_PROVIDER: z.enum(["supabase", "local"]).default("local"),
  AUTH_SECRET: z.string().default(""),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  /** 32-Byte-Schlüssel (base64) zur Verschlüsselung von Postfach-Passwörtern. */
  APP_ENCRYPTION_KEY: z.string().default(""),

  // Standard-Postfach (optional, alternativ über die Einstellungen)
  MAIL_FROM_NAME: z.string().optional(),
  MAIL_FROM_ADDRESS: z.string().optional(),
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().default(993),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_SECURE: z.string().default("true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  BREVO_API_KEY: z.string().optional(),
  BREVO_WEBHOOK_SECRET: z.string().optional(),

  AI_PROVIDER: z.enum(["anthropic", "openai", "none"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),

  FINDER_OSM_ENABLED: bool,
  FINDER_OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  FINDER_NOMINATIM_URL: z.string().default("https://nominatim.openstreetmap.org"),
  FINDER_CONTACT_EMAIL: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().default(2),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
function load(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

/** Validierte Umgebungsvariablen (lazy, damit Tests/Builds ohne .env laufen). */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    return load()[prop as keyof Env];
  },
});

export function resetEnvCache() {
  cached = undefined;
}

export function assertProductionSecrets() {
  const e = load();
  const problems: string[] = [];
  if (e.AUTH_PROVIDER === "local" && e.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET (mind. 32 Zeichen)");
  if (Buffer.from(e.APP_ENCRYPTION_KEY, "base64").length !== 32) problems.push("APP_ENCRYPTION_KEY (32 Byte base64)");
  if (e.AUTH_PROVIDER === "supabase" && (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY))
    problems.push("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return problems;
}
