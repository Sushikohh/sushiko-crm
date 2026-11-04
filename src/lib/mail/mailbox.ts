import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { Mailbox } from "@/db/schema";

export type ImapConfig = { host: string; port: number; secure: true; user: string; pass: string; folder: string };
export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; pass: string };

export function imapConfig(m: Mailbox): ImapConfig | null {
  if (!m.imapHost || !m.imapUser || !m.imapPasswordEnc) return null;
  const pass = decryptSecret(m.imapPasswordEnc);
  if (!pass) return null;
  // Nur TLS-Verbindungen (Port 993 / implizites TLS)
  return { host: m.imapHost, port: m.imapPort ?? 993, secure: true, user: m.imapUser, pass, folder: m.imapFolder || "INBOX" };
}

export function smtpConfig(m: Mailbox): SmtpConfig | null {
  if (!m.smtpHost || !m.smtpUser || !m.smtpPasswordEnc) return null;
  const pass = decryptSecret(m.smtpPasswordEnc);
  if (!pass) return null;
  return { host: m.smtpHost, port: m.smtpPort ?? 465, secure: m.smtpSecure, user: m.smtpUser, pass };
}

export type MailboxState = "connected" | "error" | "incomplete";

export function mailboxState(m: Mailbox): { state: MailboxState; label: string } {
  const imapOk = !!(m.imapHost && m.imapUser && m.imapPasswordEnc);
  const smtpOk = !!(m.smtpHost && m.smtpUser && m.smtpPasswordEnc);
  if (!imapOk || !smtpOk) return { state: "incomplete", label: "Nicht verbunden" };
  if (m.lastSyncError || m.lastSmtpError) return { state: "error", label: "Verbindungsfehler" };
  if (!m.lastSyncAt) return { state: "incomplete", label: "Noch nicht synchronisiert" };
  return { state: "connected", label: "Verbunden" };
}

export async function listMailboxes() {
  return db.select().from(schema.mailboxes).orderBy(asc(schema.mailboxes.createdAt));
}

export async function getDefaultMailbox(): Promise<Mailbox | null> {
  const [m] = await db
    .select()
    .from(schema.mailboxes)
    .where(eq(schema.mailboxes.active, true))
    .orderBy(asc(schema.mailboxes.createdAt))
    .limit(1);
  return m ?? null;
}

/** Legt beim ersten Start ein Postfach aus den Umgebungsvariablen an (falls konfiguriert). */
export async function bootstrapEnvMailbox() {
  if (!env.MAIL_FROM_ADDRESS || !env.SMTP_HOST || !env.IMAP_HOST) return null;
  const existing = await db.select().from(schema.mailboxes).limit(1);
  if (existing.length) return null;
  const [m] = await db
    .insert(schema.mailboxes)
    .values({
      name: "Geschäftspostfach",
      email: env.MAIL_FROM_ADDRESS,
      fromName: env.MAIL_FROM_NAME ?? null,
      imapHost: env.IMAP_HOST,
      imapPort: env.IMAP_PORT,
      imapUser: env.IMAP_USER ?? env.MAIL_FROM_ADDRESS,
      imapPasswordEnc: env.IMAP_PASSWORD ? encryptSecret(env.IMAP_PASSWORD) : null,
      smtpHost: env.SMTP_HOST,
      smtpPort: env.SMTP_PORT,
      smtpSecure: env.SMTP_SECURE !== "false",
      smtpUser: env.SMTP_USER ?? env.MAIL_FROM_ADDRESS,
      smtpPasswordEnc: env.SMTP_PASSWORD ? encryptSecret(env.SMTP_PASSWORD) : null,
    })
    .returning();
  return m;
}
