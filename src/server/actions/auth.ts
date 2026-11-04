"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { createSessionToken, LOCAL_SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/auth/supabase";
import { hasAnyUser, requireUser } from "@/lib/auth";
import { ensureDefaultAutomations } from "@/lib/services/automations";
import { audit } from "@/lib/services/audit";

export type AuthState = { error?: string } | undefined;

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email("Bitte gültige E-Mail-Adresse eingeben"), password: z.string().min(1, "Passwort fehlt") });

// Einfacher In-Memory-Schutz gegen Brute-Force (pro Prozess)
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;
  const a = attempts.get(email);
  if (a && a.until > Date.now()) return { error: "Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen." };

  if (env.AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return failed(email);
  } else {
    const [user] = await db.select().from(schema.profiles).where(sql`lower(${schema.profiles.email}) = ${email}`).limit(1);
    const ok = user?.passwordHash && user.active ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) return failed(email);
    (await cookies()).set(LOCAL_SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
    await audit({ actorId: user.id, action: "login", entity: "profile", entityId: user.id });
  }
  attempts.delete(email);
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

function failed(email: string): AuthState {
  const a = attempts.get(email) ?? { n: 0, until: 0 };
  a.n++;
  if (a.n >= 5) {
    a.until = Date.now() + 5 * 60_000;
    a.n = 0;
  }
  attempts.set(email, a);
  return { error: "E-Mail-Adresse oder Passwort ist falsch." };
}

export async function logoutAction() {
  if (env.AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  (await cookies()).delete(LOCAL_SESSION_COOKIE);
  redirect("/login");
}

const setupSchema = z.object({
  fullName: z.string().trim().min(2, "Name fehlt"),
  email: z.string().trim().toLowerCase().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(10, "Passwort muss mindestens 10 Zeichen haben"),
});

/** Ersteinrichtung (nur lokaler Auth-Modus und nur solange kein Benutzer existiert). */
export async function setupAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  if (env.AUTH_PROVIDER !== "local") return { error: "Bei Supabase Auth bitte den ersten Benutzer in Supabase anlegen." };
  if (await hasAnyUser()) return { error: "Die Einrichtung wurde bereits abgeschlossen." };
  const parsed = setupSchema.safeParse({ fullName: fd.get("fullName"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [user] = await db
    .insert(schema.profiles)
    .values({ email: parsed.data.email, fullName: parsed.data.fullName, role: "admin", passwordHash: await bcrypt.hash(parsed.data.password, 12) })
    .returning();
  await ensureDefaultAutomations();
  (await cookies()).set(LOCAL_SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
  redirect("/einstellungen?tab=unternehmen&willkommen=1");
}

export async function changePasswordAction(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  try {
    await changePassword(me.id, current, next);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

async function changePassword(userId: string, current: string, next: string) {
  if (env.AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw new Error(error.message);
    return;
  }
  const [u] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, userId));
  if (!u?.passwordHash || !(await bcrypt.compare(current, u.passwordHash))) throw new Error("Aktuelles Passwort ist falsch.");
  if (next.length < 10) throw new Error("Das neue Passwort muss mindestens 10 Zeichen haben.");
  await db.update(schema.profiles).set({ passwordHash: await bcrypt.hash(next, 12), updatedAt: new Date() }).where(eq(schema.profiles.id, userId));
}
