import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Tx } from "@/db";
import { ACQ_STATUS_KEYS, type AcqStatus } from "@/lib/constants";
import { normalizeEmail } from "@/lib/normalize";
import { contactName } from "@/lib/utils";
import { logActivity } from "./audit";
import { recalcCompanyScore } from "./companies";

type Conn = typeof db | Tx;

const optStr = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const contactInputSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  salutation: optStr,
  firstName: z.string().trim().default(""),
  lastName: z.string().trim().default(""),
  position: optStr,
  email: optStr.refine((v) => !v || !!normalizeEmail(v), "Ungültige E-Mail-Adresse"),
  phone: optStr,
  status: z.enum(ACQ_STATUS_KEYS as [AcqStatus, ...AcqStatus[]]).optional(),
  ownerId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1)).optional(),
  notes: optStr,
  source: z.string().default("manual"),
  isPrimary: z.boolean().optional(),
});
export type ContactInput = z.input<typeof contactInputSchema>;

export async function findContactByEmail(email: string, conn: Conn = db) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const [c] = await conn.select().from(schema.contacts).where(sql`lower(${schema.contacts.email}) = ${e}`).limit(1);
  return c ?? null;
}

export async function createContact(raw: ContactInput, actorId: string | null, conn: Conn = db) {
  const input = contactInputSchema.parse(raw);
  if (!input.firstName && !input.lastName && !input.email) throw new Error("Name oder E-Mail-Adresse ist erforderlich");
  const email = normalizeEmail(input.email);
  if (email) {
    const dupe = await findContactByEmail(email, conn);
    if (dupe) throw new Error(`Ein Ansprechpartner mit ${email} existiert bereits (${contactName(dupe)}).`);
  }
  const [row] = await conn
    .insert(schema.contacts)
    .values({
      companyId: input.companyId ?? null,
      salutation: input.salutation,
      firstName: input.firstName,
      lastName: input.lastName,
      position: input.position,
      email,
      phone: input.phone,
      status: input.status ?? "new",
      ownerId: input.ownerId ?? actorId,
      tags: input.tags ?? [],
      notes: input.notes,
      source: input.source,
      isPrimary: input.isPrimary ?? false,
    })
    .returning();
  await logActivity({ type: "system", title: `Ansprechpartner angelegt: ${contactName(row)}`, companyId: row.companyId, contactId: row.id, userId: actorId }, conn);
  if (row.companyId) await recalcCompanyScore(row.companyId, conn);
  return row;
}

export async function updateContact(id: string, raw: Partial<ContactInput>, actorId: string | null) {
  const input = contactInputSchema.partial().parse(raw);
  const [before] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id));
  if (!before) throw new Error("Ansprechpartner nicht gefunden");
  const patch: Partial<typeof schema.contacts.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["companyId", "salutation", "position", "phone", "notes", "ownerId"] as const) if (k in raw) patch[k] = input[k] ?? null;
  if ("firstName" in raw) patch.firstName = input.firstName ?? "";
  if ("lastName" in raw) patch.lastName = input.lastName ?? "";
  if ("email" in raw) {
    const e = normalizeEmail(input.email);
    if (e && e !== before.email) {
      const dupe = await findContactByEmail(e);
      if (dupe && dupe.id !== id) throw new Error(`Die Adresse ${e} gehört bereits zu ${contactName(dupe)}.`);
    }
    patch.email = e;
  }
  if (input.tags) patch.tags = input.tags;
  if (input.status) patch.status = input.status;
  if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;
  await db.update(schema.contacts).set(patch).where(eq(schema.contacts.id, id));
  if (input.status && input.status !== before.status) {
    await logActivity({ type: "status_change", title: "Kontaktstatus geändert", companyId: before.companyId, contactId: id, userId: actorId, meta: { from: before.status, to: input.status } });
  }
  const companyId = patch.companyId ?? before.companyId;
  if (companyId) await recalcCompanyScore(companyId);
}
