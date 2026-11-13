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
  /** Verbindungen der Job-Queue (pg-boss). Klein halten beim Supabase-Pooler. */
  PGBOSS_POOL_SIZE: z.coerce.number().optional(),

  AUTH_PROVIDER: z.enum(["supabase", "local"]).default("local"),
  AUTH_SECRET: z.string().default(""),
  // Supabase – serverseitig zur Laufzeit gelesen (bewusst ohne NEXT_PUBLIC_, das würde beim Build eingefroren)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  // Ältere Namen werden weiterhin akzeptiert
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  RENDER_EXTERNAL_URL: z.string().optional(),

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
  if (!cached) {
    const e = schema.parse(process.env);
    // APP_URL nicht gesetzt → von der Hosting-Plattform übernehmen (z. B. Render)
    if (!process.env.APP_URL && e.RENDER_EXTERNAL_URL) e.APP_URL = e.RENDER_EXTERNAL_URL;
    cached = e;
  }
  return cached;
}

/** Supabase-Zugangsdaten (neue Namen bevorzugt, alte als Fallback). */
export function supabaseConfig() {
  const e = load();
  return {
    url: e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || "",
    publishableKey: e.SUPABASE_PUBLISHABLE_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    secretKey: e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY || "",
  };
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
  if ((e.APP_ENCRYPTION_KEY ?? "").trim().length < 32) problems.push("APP_ENCRYPTION_KEY (mind. 32 Zeichen)");
  if (e.AUTH_PROVIDER === "supabase" && (!supabaseConfig().url || !supabaseConfig().publishableKey)) problems.push("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  return problems;
}
