"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { renderTemplate, templateValues, findUnknownVariables } from "@/lib/templates";
import { addRecipients, pauseCampaign, saveCampaign, startCampaign, type CampaignInput } from "@/lib/services/campaigns";
import { contactWhere } from "@/lib/services/contact-queries";
import { getSetting } from "@/lib/services/settings";
import { getDefaultMailbox } from "@/lib/mail/mailbox";
import { run } from "@/server/action";

function rp(id?: string) {
  revalidatePath("/kampagnen");
  if (id) revalidatePath(`/kampagnen/${id}`);
}

export async function saveCampaignAction(id: string | null, input: CampaignInput) {
  const me = await requireUser();
  return run(async () => {
    const unknown = input.steps.flatMap((s) => [...findUnknownVariables(s.subject), ...findUnknownVariables(s.body)]);
    if (unknown.length) throw new Error(`Unbekannte Platzhalter: ${[...new Set(unknown)].map((u) => `{{${u}}}`).join(", ")}`);
    const cid = await saveCampaign(id, input, me.id);
    rp(cid);
    return cid;
  }, "Kampagne gespeichert");
}

export async function addRecipientsAction(campaignId: string, contactIds: string[]) {
  await requireUser();
  return run(async () => {
    const r = await addRecipients(campaignId, contactIds);
    rp(campaignId);
    return r;
  });
}

/** Fügt alle Kontakte hinzu, die zum Filter passen (Branche, Status, Tag …). */
export async function addRecipientsByFilterAction(campaignId: string, filter: Record<string, string>) {
  await requireUser();
  return run(async () => {
    const where = contactWhere({ ...filter, email: "ja" });
    const rows = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(where)
      .limit(5000);
    const r = await addRecipients(campaignId, rows.map((x) => x.id));
    rp(campaignId);
    return r;
  });
}

export async function removeRecipientsAction(campaignId: string, recipientIds: string[]) {
  await requireUser();
  return run(async () => {
    await db
      .delete(schema.campaignRecipients)
      .where(and(eq(schema.campaignRecipients.campaignId, campaignId), inArray(schema.campaignRecipients.id, recipientIds), sql`${schema.campaignRecipients.currentStep} = 0`));
    rp(campaignId);
  }, "Entfernt");
}

export async function startCampaignAction(id: string) {
  await requireUser();
  return run(async () => {
    await startCampaign(id);
    rp(id);
  }, "Kampagne gestartet");
}

export async function pauseCampaignAction(id: string) {
  await requireUser();
  return run(async () => {
    await pauseCampaign(id);
    rp(id);
  }, "Kampagne pausiert");
}

export async function archiveCampaignAction(id: string) {
  await requireUser();
  return run(async () => {
    await pauseCampaign(id);
    await db.update(schema.campaigns).set({ status: "archived" }).where(eq(schema.campaigns.id, id));
    rp(id);
  }, "Archiviert");
}

export async function deleteCampaignAction(id: string) {
  await requireUser();
  return run(async () => {
    const [{ sent }] = await db.select({ sent: sql<number>`count(*)::int` }).from(schema.emailMessages).where(eq(schema.emailMessages.campaignId, id));
    if (sent > 0) throw new Error("Kampagnen mit versendeten E-Mails können nur archiviert werden (Nachweispflicht).");
    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
    rp();
  }, "Gelöscht");
}

/** Vorschau eines Schritts mit echten Daten eines Empfängers. */
export async function previewStepAction(subject: string, body: string, contactId?: string) {
  await requireUser();
  return run(async () => {
    const identity = await getSetting("sender_identity");
    const mailbox = await getDefaultMailbox();
    let contact = { salutation: "Frau", firstName: "Erika", lastName: "Musterfrau", position: "Objektleitung" } as { salutation: string | null; firstName: string; lastName: string; position: string | null };
    let company = { name: "Beispiel Immobilien GmbH", district: "Altona", city: "Hamburg", industry: "property_management" as string | null };
    let example = true;
    if (contactId) {
      const [row] = await db
        .select({ contact: schema.contacts, company: schema.companies })
        .from(schema.contacts)
        .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
        .where(eq(schema.contacts.id, contactId));
      if (row) {
        contact = row.contact;
        company = { name: row.company?.name ?? "", district: row.company?.district ?? "", city: row.company?.city ?? "", industry: row.company?.industry ?? null };
        example = false;
      }
    }
    const values = templateValues({ contact, company, sender: { name: mailbox?.fromName ?? identity?.companyName ?? "Ihr Name", company: identity?.companyName ?? "Ihre Firma", phone: identity?.phone } });
    return { subject: renderTemplate(subject, values), body: renderTemplate(body, values), example };
  });
}
