import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { LOCAL_SESSION_COOKIE, verifySessionToken } from "./session";
import { supabaseServer } from "./supabase";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "member";
  emailSignature: string | null;
};

async function profileById(id: string) {
  const [p] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, id)).limit(1);
  return p ?? null;
}

/** Legt bei Supabase Auth beim ersten Login ein Profil an. Der erste Benutzer wird Admin. */
async function ensureSupabaseProfile(id: string, email: string, name?: string) {
  const existing = await profileById(id);
  if (existing) return existing;
  const [{ n }] = await db.select({ n: count() }).from(schema.profiles);
  const [created] = await db
    .insert(schema.profiles)
    .values({ id, email: email.toLowerCase(), fullName: name ?? email.split("@")[0], role: n === 0 ? "admin" : "member" })
    .onConflictDoUpdate({ target: schema.profiles.email, set: { id: sql`excluded.id` } })
    .returning();
  return created;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  let profile: typeof schema.profiles.$inferSelect | null = null;
  if (env.AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) return null;
    profile = await ensureSupabaseProfile(data.user.id, data.user.email, data.user.user_metadata?.full_name);
  } else {
    const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value;
    const userId = await verifySessionToken(token);
    if (!userId) return null;
    profile = await profileById(userId);
  }
  if (!profile || !profile.active) return null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
    emailSignature: profile.emailSignature,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Nur Administratoren dürfen diese Aktion ausführen.");
  return user;
}

export async function hasAnyUser() {
  const [{ n }] = await db.select({ n: count() }).from(schema.profiles);
  return n > 0;
}
