import { eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { evaluateMarketingEligibility, type EligibilityResult, type PermissionRecord } from "@/lib/compliance";
import type { PermissionBasisKey } from "@/lib/constants";
import { normalizeEmail } from "@/lib/normalize";
import { isSenderIdentityComplete } from "@/lib/templates";
import { getSetting } from "./settings";

type Conn = typeof db | Tx;

export async function getPermission(email: string, conn: Conn = db) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const [p] = await conn
    .select()
    .from(schema.emailPermissions)
    .where(sql`lower(${schema.emailPermissions.email}) = ${e}`)
    .limit(1);
  return p ?? null;
}

export async function isSuppressed(email: string, conn: Conn = db) {
  const e = normalizeEmail(email);
  if (!e) return false;
  const [s] = await conn
    .select({ id: schema.suppressions.id })
    .from(schema.suppressions)
    .where(sql`lower(${schema.suppressions.email}) = ${e}`)
    .limit(1);
  return !!s;
}

export async function suppress(email: string, reason: string, details?: string, conn: Conn = db) {
  const e = normalizeEmail(email);
  if (!e) return;
  await conn.execute(sql`
    insert into suppressions (email, reason, details) values (${e}, ${reason}, ${details ?? null})
    on conflict (lower(email)) do nothing`);
}

export async function unsuppress(email: string, conn: Conn = db) {
  const e = normalizeEmail(email);
  if (!e) return;
  await conn.delete(schema.suppressions).where(sql`lower(${schema.suppressions.email}) = ${e}`);
}

/**
 * Setzt die Rechtsgrundlage für eine Adresse und protokolliert die Änderung revisionssicher.
 * Widerspruch/Widerruf setzen die Adresse zusätzlich auf die Sperrliste.
 */
export async function setPermission(
  input: {
    email: string;
    basis: PermissionBasisKey;
    contactId?: string | null;
    grantedAt?: Date | null;
    /** Nur für nachgewiesene, extern durchgeführte Double-Opt-ins (z. B. Import aus Newsletter-System). */
    doiConfirmedAt?: Date | null;
    evidence?: string | null;
    source?: string | null;
    reason?: string | null;
    actorId?: string | null;
    actorLabel?: string | null;
  },
  conn: Conn = db,
) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Ungültige E-Mail-Adresse");
  const current = await getPermission(email, conn);
  const now = new Date();
  const revoked = input.basis === "objected" || input.basis === "revoked";
  const values = {
    email,
    contactId: input.contactId ?? current?.contactId ?? null,
    basis: input.basis,
    grantedAt: revoked ? (current?.grantedAt ?? null) : (input.grantedAt ?? current?.grantedAt ?? (input.basis === "none" ? null : now)),
    revokedAt: revoked ? now : null,
    evidence: input.evidence ?? current?.evidence ?? null,
    source: input.source ?? current?.source ?? null,
    doiConfirmedAt: input.basis === "double_opt_in" ? (input.doiConfirmedAt ?? current?.doiConfirmedAt ?? null) : (current?.doiConfirmedAt ?? null),
    recordedBy: input.actorId ?? null,
    updatedAt: now,
  };
  if (current) {
    await conn.update(schema.emailPermissions).set(values).where(eq(schema.emailPermissions.id, current.id));
  } else {
    await conn.insert(schema.emailPermissions).values(values);
  }
  await conn.insert(schema.permissionEvents).values({
    email,
    fromBasis: current?.basis ?? null,
    toBasis: input.basis,
    reason: input.reason ?? null,
    evidence: input.evidence ?? null,
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
  });
  if (revoked) await suppress(email, input.basis === "objected" ? "Werbewiderspruch" : "Einwilligung widerrufen", input.reason ?? undefined, conn);
}

function toRecord(p: typeof schema.emailPermissions.$inferSelect | null | undefined): PermissionRecord | null {
  if (!p) return null;
  return { basis: p.basis, grantedAt: p.grantedAt, revokedAt: p.revokedAt, evidence: p.evidence, doiConfirmedAt: p.doiConfirmedAt };
}

/** Werbe-Versandberechtigung für eine Liste von Kontakten (Batch). */
export async function eligibilityForContacts(contactIds: string[], conn: Conn = db): Promise<Map<string, EligibilityResult & { email: string | null }>> {
  const out = new Map<string, EligibilityResult & { email: string | null }>();
  if (!contactIds.length) return out;
  const identity = await getSetting("sender_identity");
  const senderOk = isSenderIdentityComplete(identity);
  const rows = await conn
    .select({
      id: schema.contacts.id,
      email: schema.contacts.email,
      status: schema.contacts.status,
      companyStatus: schema.companies.status,
    })
    .from(schema.contacts)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
    .where(inArray(schema.contacts.id, contactIds));
  const emails = rows.map((r) => normalizeEmail(r.email)).filter((e): e is string => !!e);
  const perms = emails.length
    ? await conn.select().from(schema.emailPermissions).where(sql`lower(${schema.emailPermissions.email}) in ${emails}`)
    : [];
  const sups = emails.length
    ? await conn.select({ email: schema.suppressions.email }).from(schema.suppressions).where(sql`lower(${schema.suppressions.email}) in ${emails}`)
    : [];
  const permMap = new Map(perms.map((p) => [p.email.toLowerCase(), p]));
  const supSet = new Set(sups.map((s) => s.email.toLowerCase()));
  for (const r of rows) {
    const e = normalizeEmail(r.email);
    const res = evaluateMarketingEligibility({
      email: e,
      permission: toRecord(e ? permMap.get(e) : null),
      suppressed: e ? supSet.has(e) : false,
      contactStatus: r.status,
      companyStatus: r.companyStatus,
      senderIdentityComplete: senderOk,
    });
    out.set(r.id, { ...res, email: e });
  }
  return out;
}

export async function eligibilityForContact(contactId: string, conn: Conn = db) {
  return (await eligibilityForContacts([contactId], conn)).get(contactId) ?? null;
}

/** SQL-Bedingung „Kontakt hat eine werberechtlich nutzbare Grundlage“ (für Zählungen/Filter). */
export const permittedContactSql = sql`exists (
  select 1 from email_permissions ep
  where lower(ep.email) = lower(contacts.email)
    and ep.basis in ('express_consent','double_opt_in','existing_customer')
    and ep.revoked_at is null
    and (ep.basis <> 'double_opt_in' or ep.doi_confirmed_at is not null)
    and (ep.basis = 'double_opt_in' or coalesce(ep.evidence,'') <> '')
) and not exists (select 1 from suppressions s where lower(s.email) = lower(contacts.email))`;
