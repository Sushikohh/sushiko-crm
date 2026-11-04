"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { PERMISSION_KEYS, type PermissionBasisKey } from "@/lib/constants";
import { logActivity } from "@/lib/services/audit";
import { createContact, updateContact, type ContactInput } from "@/lib/services/contacts";
import { setPermission, unsuppress } from "@/lib/services/permissions";
import { run } from "@/server/action";

function revalidate(contactId?: string, companyId?: string | null) {
  revalidatePath("/ansprechpartner");
  if (contactId) revalidatePath(`/ansprechpartner/${contactId}`);
  if (companyId) revalidatePath(`/unternehmen/${companyId}`);
}

export async function createContactAction(input: ContactInput) {
  const me = await requireUser();
  return run(async () => {
    const c = await createContact(input, me.id);
    revalidate(c.id, c.companyId);
    return c.id;
  }, "Ansprechpartner angelegt");
}

export async function updateContactAction(id: string, input: Partial<ContactInput>) {
  const me = await requireUser();
  return run(async () => {
    await updateContact(id, input, me.id);
    const [c] = await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(eq(schema.contacts.id, id));
    revalidate(id, c?.companyId);
  }, "Gespeichert");
}

export async function deleteContactsAction(ids: string[]) {
  const me = await requireUser();
  return run(async () => {
    await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids));
    await db.insert(schema.auditLog).values({ actorId: me.id, action: "delete", entity: "contact", details: { ids } });
    revalidate();
  }, "Gelöscht");
}

const permissionSchema = z
  .object({
    contactId: z.string().uuid(),
    basis: z.enum(PERMISSION_KEYS as [PermissionBasisKey, ...PermissionBasisKey[]]),
    grantedAt: z.string().optional(),
    evidence: z.string().trim().max(5000).optional(),
    source: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(500).optional(),
    confirmLegal: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.basis === "express_consent" || v.basis === "existing_customer") {
      if (!v.evidence || v.evidence.length < 10) ctx.addIssue({ code: "custom", path: ["evidence"], message: "Bitte den Nachweis konkret dokumentieren (mind. 10 Zeichen)." });
      if (!v.confirmLegal) ctx.addIssue({ code: "custom", path: ["confirmLegal"], message: "Bitte bestätigen Sie, dass die Voraussetzungen erfüllt sind." });
    }
    if (v.basis === "express_consent" && !v.grantedAt) ctx.addIssue({ code: "custom", path: ["grantedAt"], message: "Datum der Einwilligung fehlt." });
    if (v.basis === "double_opt_in") ctx.addIssue({ code: "custom", path: ["basis"], message: "Double-Opt-in kann nur durch Bestätigung des Empfängers gesetzt werden." });
  });

/** Setzt die Werbeerlaubnis manuell – mit Pflichtnachweis und revisionssicherem Protokoll. */
export async function setPermissionAction(raw: z.input<typeof permissionSchema>) {
  const me = await requireUser();
  return run(async () => {
    const v = permissionSchema.parse(raw);
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, v.contactId));
    if (!c?.email) throw new Error("Der Ansprechpartner hat keine E-Mail-Adresse.");
    await setPermission({
      email: c.email,
      basis: v.basis,
      contactId: c.id,
      grantedAt: v.grantedAt ? new Date(v.grantedAt) : null,
      evidence: v.evidence ?? null,
      source: v.source ?? "manuell",
      reason: v.reason ?? null,
      actorId: me.id,
      actorLabel: me.fullName,
    });
    // Eine neu erteilte Einwilligung hebt eine frühere Sperre nur auf, wenn sie ausdrücklich erteilt wurde.
    if (v.basis === "express_consent") await unsuppress(c.email);
    if (v.basis === "objected" || v.basis === "revoked") await db.update(schema.contacts).set({ status: "blocked" }).where(eq(schema.contacts.id, c.id));
    await logActivity({ type: "permission_change", title: `Werbeerlaubnis: ${v.basis}`, body: v.evidence ?? v.reason ?? null, companyId: c.companyId, contactId: c.id, userId: me.id });
    revalidate(c.id, c.companyId);
  }, "Werbeerlaubnis aktualisiert");
}
