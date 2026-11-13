"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { db, schema } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { imapConfig, smtpConfig } from "@/lib/mail/mailbox";
import { verifyImap } from "@/lib/mail/imap";
import { verifySmtp } from "@/lib/mail/smtp";
import { normalizeEmail } from "@/lib/normalize";
import { enqueue, QUEUES } from "@/lib/queue";
import { audit } from "@/lib/services/audit";
import { suppress, unsuppress } from "@/lib/services/permissions";
import { catalogSettingsSchema, salesSettingsSchema, senderIdentitySchema, setSetting } from "@/lib/services/settings";
import { run } from "@/server/action";

export async function saveIdentityAction(raw: z.input<typeof senderIdentitySchema>) {
  const me = await requireAdmin();
  return run(async () => {
    const v = senderIdentitySchema.parse(raw);
    await setSetting("sender_identity", v);
    await audit({ actorId: me.id, action: "update", entity: "settings", entityId: "sender_identity" });
    revalidatePath("/", "layout");
  }, "Absenderangaben gespeichert");
}

export async function saveSalesSettingsAction(raw: z.input<typeof salesSettingsSchema>) {
  await requireAdmin();
  return run(async () => {
    await setSetting("sales", salesSettingsSchema.parse(raw));
    revalidatePath("/einstellungen");
  }, "Gespeichert");
}

export async function saveCatalogAction(raw: z.input<typeof catalogSettingsSchema>) {
  const me = await requireAdmin();
  return run(async () => {
    const v = catalogSettingsSchema.parse(raw);
    await setSetting("catalog", v);
    await audit({ actorId: me.id, action: "update", entity: "settings", entityId: "catalog", details: { items: v.items.length } });
    revalidatePath("/einstellungen");
    revalidatePath("/angebote");
  }, "Katalog gespeichert");
}

const mailboxSchema = z.object({
  name: z.string().trim().min(1).default("Geschäftspostfach"),
  email: z.string().trim().refine((v) => !!normalizeEmail(v), "Ungültige E-Mail-Adresse"),
  fromName: z.string().trim().optional().nullable(),
  imapHost: z.string().trim().min(3, "IMAP-Server fehlt"),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapUser: z.string().trim().min(1, "IMAP-Benutzer fehlt"),
  imapPassword: z.string().optional(),
  imapFolder: z.string().trim().default("INBOX"),
  smtpHost: z.string().trim().min(3, "SMTP-Server fehlt"),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  smtpUser: z.string().trim().min(1, "SMTP-Benutzer fehlt"),
  smtpPassword: z.string().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(2000).default(80),
});

/** Speichert ein Postfach. Leere Passwortfelder behalten das bisherige (verschlüsselte) Passwort. */
export async function saveMailboxAction(id: string | null, raw: z.input<typeof mailboxSchema>) {
  const me = await requireAdmin();
  return run(async () => {
    const v = mailboxSchema.parse(raw);
    if (v.smtpPort === 25) throw new Error("Port 25 ohne TLS wird nicht unterstützt. Bitte 465 (TLS) oder 587 (STARTTLS) verwenden.");
    if (v.imapPort === 143) throw new Error("IMAP nur über TLS (Port 993).");
    const values = {
      name: v.name,
      email: normalizeEmail(v.email)!,
      fromName: v.fromName || null,
      imapHost: v.imapHost,
      imapPort: v.imapPort,
      imapUser: v.imapUser,
      imapFolder: v.imapFolder || "INBOX",
      smtpHost: v.smtpHost,
      smtpPort: v.smtpPort,
      smtpSecure: v.smtpPort === 465 ? true : v.smtpSecure && v.smtpPort !== 587,
      smtpUser: v.smtpUser,
      dailyLimit: v.dailyLimit,
      updatedAt: new Date(),
      ...(v.imapPassword ? { imapPasswordEnc: encryptSecret(v.imapPassword) } : {}),
      ...(v.smtpPassword ? { smtpPasswordEnc: encryptSecret(v.smtpPassword) } : {}),
      lastSyncError: null,
      lastSmtpError: null,
    };
    let mid = id;
    if (id) await db.update(schema.mailboxes).set(values).where(eq(schema.mailboxes.id, id));
    else {
      if (!v.imapPassword || !v.smtpPassword) throw new Error("Bitte IMAP- und SMTP-Passwort angeben.");
      const [m] = await db.insert(schema.mailboxes).values(values).returning({ id: schema.mailboxes.id });
      mid = m.id;
    }
    await audit({ actorId: me.id, action: id ? "update" : "create", entity: "mailbox", entityId: mid });
    revalidatePath("/einstellungen");
    return mid;
  }, "Postfach gespeichert");
}

export async function testMailboxAction(id: string) {
  await requireAdmin();
  return run(async () => {
    const [m] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, id));
    if (!m) throw new Error("Postfach nicht gefunden");
    const result: { imap: string; smtp: string } = { imap: "", smtp: "" };
    const ic = imapConfig(m);
    const sc = smtpConfig(m);
    try {
      if (!ic) throw new Error("nicht konfiguriert");
      const r = await verifyImap(ic);
      result.imap = `OK – ${r.messages} Nachrichten in ${ic.folder}`;
      await db.update(schema.mailboxes).set({ lastSyncError: null }).where(eq(schema.mailboxes.id, id));
    } catch (e) {
      result.imap = `Fehler: ${e instanceof Error ? e.message : String(e)}`;
      await db.update(schema.mailboxes).set({ lastSyncError: result.imap }).where(eq(schema.mailboxes.id, id));
    }
    try {
      if (!sc) throw new Error("nicht konfiguriert");
      await verifySmtp(sc);
      result.smtp = "OK – Anmeldung erfolgreich";
      await db.update(schema.mailboxes).set({ lastSmtpError: null, lastSmtpCheckAt: new Date() }).where(eq(schema.mailboxes.id, id));
    } catch (e) {
      result.smtp = `Fehler: ${e instanceof Error ? e.message : String(e)}`;
      await db.update(schema.mailboxes).set({ lastSmtpError: result.smtp, lastSmtpCheckAt: new Date() }).where(eq(schema.mailboxes.id, id));
    }
    if (result.imap.startsWith("OK")) await enqueue(QUEUES.syncMailbox, { mailboxId: id }, { singletonKey: `sync:${id}`, singletonSeconds: 30 }).catch(() => undefined);
    revalidatePath("/einstellungen");
    return result;
  });
}

export async function deleteMailboxAction(id: string) {
  const me = await requireAdmin();
  return run(async () => {
    await db.delete(schema.mailboxes).where(eq(schema.mailboxes.id, id));
    await audit({ actorId: me.id, action: "delete", entity: "mailbox", entityId: id });
    revalidatePath("/einstellungen");
  }, "Postfach entfernt");
}

export async function updateProfileAction(raw: { fullName: string; emailSignature: string }) {
  const me = await requireUser();
  return run(async () => {
    const v = z.object({ fullName: z.string().trim().min(2), emailSignature: z.string().max(2000) }).parse(raw);
    await db.update(schema.profiles).set({ fullName: v.fullName, emailSignature: v.emailSignature || null, updatedAt: new Date() }).where(eq(schema.profiles.id, me.id));
    revalidatePath("/", "layout");
  }, "Profil gespeichert");
}

const inviteSchema = z.object({ fullName: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), role: z.enum(["admin", "member"]), password: z.string().optional() });

/** Neuen Mitarbeiter anlegen (lokal: mit Startpasswort; Supabase: Einladung per E-Mail). */
export async function inviteUserAction(raw: z.input<typeof inviteSchema>) {
  const me = await requireAdmin();
  return run(async () => {
    const v = inviteSchema.parse(raw);
    if (env.AUTH_PROVIDER === "supabase") {
      if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Für Einladungen wird SUPABASE_SERVICE_ROLE_KEY benötigt. Alternativ Benutzer im Supabase-Dashboard einladen.");
      const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, { data: { full_name: v.fullName }, redirectTo: `${env.APP_URL}/login` });
      if (error) throw new Error(error.message);
      await db
        .insert(schema.profiles)
        .values({ id: data.user.id, email: v.email, fullName: v.fullName, role: v.role })
        .onConflictDoUpdate({ target: schema.profiles.email, set: { fullName: v.fullName, role: v.role } });
    } else {
      if (!v.password || v.password.length < 10) throw new Error("Startpasswort mit mindestens 10 Zeichen angeben.");
      await db.insert(schema.profiles).values({ email: v.email, fullName: v.fullName, role: v.role, passwordHash: await bcrypt.hash(v.password, 12) });
    }
    await audit({ actorId: me.id, action: "invite", entity: "profile", details: { email: v.email, role: v.role } });
    revalidatePath("/einstellungen");
  }, "Mitarbeiter angelegt");
}

export async function setUserActiveAction(id: string, active: boolean, role?: "admin" | "member") {
  const me = await requireAdmin();
  return run(async () => {
    if (id === me.id) throw new Error("Eigenes Konto kann nicht geändert werden.");
    await db.update(schema.profiles).set({ active, ...(role ? { role } : {}) }).where(eq(schema.profiles.id, id));
    revalidatePath("/einstellungen");
  });
}

export async function addSuppressionAction(email: string, reason: string) {
  const me = await requireUser();
  return run(async () => {
    const e = normalizeEmail(email);
    if (!e) throw new Error("Ungültige E-Mail-Adresse");
    await suppress(e, reason || "Manuell gesperrt");
    await audit({ actorId: me.id, action: "suppress", entity: "email", entityId: e });
    revalidatePath("/einstellungen");
  }, "Adresse gesperrt");
}

export async function removeSuppressionAction(email: string) {
  const me = await requireAdmin();
  return run(async () => {
    await unsuppress(email);
    await audit({ actorId: me.id, action: "unsuppress", entity: "email", entityId: email });
    revalidatePath("/einstellungen");
  }, "Sperre aufgehoben");
}
