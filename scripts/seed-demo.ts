/**
 * DEMODATEN – ausschließlich für lokale Entwicklung und UI-Tests.
 * Alle Datensätze sind fiktiv, tragen den Tag „Demo“ und die Quelle „demo“.
 * E-Mail-Adressen verwenden die reservierte Domain example.com (RFC 2606) – es wird nichts versendet.
 * In Produktion (NODE_ENV=production) verweigert das Skript die Ausführung.
 *
 * Entfernen: npm run db:seed:demo -- --remove
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { closeDb, db, schema } from "@/db";
import { normalizeCompanyName } from "@/lib/normalize";
import type { IndustryKey } from "@/lib/constants";
import { ensureDefaultAutomations } from "@/lib/services/automations";
import { recalcCompanyScore } from "@/lib/services/companies";

if (process.env.NODE_ENV === "production") {
  console.error("Demodaten dürfen nicht in Produktion angelegt werden.");
  process.exit(1);
}

const DEMO: [string, IndustryKey, string, string, string][] = [
  ["Demo Alsterblick Hausverwaltung", "property_management", "20354", "Neustadt", "Objektverwaltung"],
  ["Demo Elbufer Immobilien", "commercial_property", "22767", "Altona-Altstadt", "Asset Management"],
  ["Demo Praxis am Schanzenpark", "medical", "20357", "Sternschanze", "Praxisinhaberin"],
  ["Demo Zahnzentrum Eppendorf", "medical", "20249", "Eppendorf", "Praxismanagement"],
  ["Demo FitWerk Barmbek", "fitness", "22305", "Barmbek-Nord", "Studioleitung"],
  ["Demo Kita Sonnenstrahl", "daycare", "22761", "Bahrenfeld", "Kitaleitung"],
  ["Demo Hafen Logistik", "logistics", "21129", "Finkenwerder", "Facility Management"],
  ["Demo Business Park Billbrook", "business_park", "22113", "Billbrook", "Centermanagement"],
  ["Demo Hotel Speicherstadt", "hotel", "20457", "HafenCity", "Hausdame"],
  ["Demo Kanzlei Rothenbaum", "office", "20148", "Rotherbaum", "Office Management"],
  ["Demo Sprachschule Winterhude", "education", "22301", "Winterhude", "Geschäftsführung"],
  ["Demo Modehaus Ottensen", "retail", "22765", "Ottensen", "Filialleitung"],
];
const FIRST = ["Anna", "Jonas", "Lea", "Mehmet", "Sophie", "Lukas", "Mia", "Paul", "Hannah", "Finn", "Emma", "Ben"];
const LAST = ["Petersen", "Schulz", "Hansen", "Yilmaz", "Jensen", "Wagner", "Becker", "Krüger", "Lorenz", "Möller", "Brandt", "Vogel"];

async function remove() {
  const ids = (await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.source, "demo"))).map((r) => r.id);
  if (ids.length) {
    await db.delete(schema.emailMessages).where(inArray(schema.emailMessages.companyId, ids));
    await db.delete(schema.companies).where(inArray(schema.companies.id, ids));
  }
  await db.execute(sql`delete from email_permissions where email like '%@example.com'`);
  await db.execute(sql`delete from suppressions where email like '%@example.com'`);
  await db.execute(sql`delete from campaigns where name like 'Demo:%'`);
  console.log(`${ids.length} Demo-Unternehmen entfernt.`);
}

async function seed() {
  const [owner] = await db.select().from(schema.profiles).limit(1);
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.companies).where(eq(schema.companies.source, "demo"));
  if (existing.n > 0) {
    console.log("Demodaten sind bereits vorhanden (zum Entfernen: --remove).");
    return;
  }
  await ensureDefaultAutomations();
  const [campaign] = await db
    .insert(schema.campaigns)
    .values({ name: "Demo: Hausverwaltungen & Praxen", status: "completed", channel: "smtp", ownerId: owner?.id, startedAt: new Date(Date.now() - 60 * 86400_000) })
    .returning();
  const [step] = await db.insert(schema.campaignSteps).values({ campaignId: campaign.id, stepOrder: 0, subject: "Reinigung für {{firma}}", body: "{{anrede}}, …" }).returning();

  const day = 86400_000;
  for (const [i, [name, industry, plz, district, position]] of DEMO.entries()) {
    const capturedAt = new Date(Date.now() - (80 - i * 5) * day);
    const [co] = await db
      .insert(schema.companies)
      .values({
        name,
        normalizedName: normalizeCompanyName(name),
        industry,
        street: `Demostraße ${i + 1}`,
        postalCode: plz,
        city: "Hamburg",
        district,
        website: `https://demo-${i}.example.com`,
        domain: `demo-${i}.example.com`,
        phone: `040 000000${i}`,
        source: "demo",
        sourceRef: `demo-${i}`,
        tags: ["Demo"],
        employeeCount: 10 + i * 7,
        areaSqm: 300 + i * 180,
        ownerId: owner?.id,
        capturedAt,
        estimatedMonthlyValue: String(600 + i * 150),
      })
      .returning();
    const email = `${FIRST[i].toLowerCase()}.${i}@example.com`;
    const [ct] = await db
      .insert(schema.contacts)
      .values({ companyId: co.id, salutation: i % 2 ? "Herr" : "Frau", firstName: FIRST[i], lastName: LAST[i], position, email, source: "demo", tags: ["Demo"], isPrimary: true })
      .returning();
    // Fiktive, als Demo gekennzeichnete Einwilligung
    if (i % 3 !== 2) {
      await db.insert(schema.emailPermissions).values({ email, contactId: ct.id, basis: "express_consent", grantedAt: capturedAt, evidence: "DEMO – fiktiver Nachweis", source: "Demo" });
    }
    if (i % 3 === 2) {
      await recalcCompanyScore(co.id);
      continue;
    }
    const [rec] = await db.insert(schema.campaignRecipients).values({ campaignId: campaign.id, contactId: ct.id, status: "completed", currentStep: 1, lastSentAt: new Date(capturedAt.getTime() + 3 * day) }).returning();
    const sentAt = new Date(capturedAt.getTime() + 3 * day);
    const bounced = i === 7;
    const msgId = `<${randomUUID()}@demo.example.com>`;
    await db.insert(schema.emailMessages).values({
      direction: "outbound",
      kind: "campaign",
      status: bounced ? "bounced" : "accepted",
      channel: "smtp",
      campaignId: campaign.id,
      campaignStepId: step.id,
      recipientId: rec.id,
      contactId: ct.id,
      companyId: co.id,
      fromEmail: "demo@example.com",
      toEmails: [email],
      subject: `Reinigung für ${name}`,
      bodyText: "Demo-Nachricht",
      snippet: "Demo-Nachricht",
      messageIdHeader: msgId,
      threadKey: msgId,
      sentAt,
      bouncedAt: bounced ? sentAt : null,
      createdAt: sentAt,
      smtpResponse: bounced ? "550 5.1.1 User unknown (Demo)" : "250 2.0.0 OK (Demo)",
    });
    const replyCat = ["meeting_request", "interested", "later", "not_interested", "question", "interested", null, null, "interested"][i] ?? null;
    if (replyCat && !bounced) {
      const receivedAt = new Date(sentAt.getTime() + 2 * day);
      await db.insert(schema.emailMessages).values({
        direction: "inbound",
        kind: "reply",
        status: "received",
        campaignId: campaign.id,
        recipientId: rec.id,
        contactId: ct.id,
        companyId: co.id,
        fromEmail: email,
        fromName: `${FIRST[i]} ${LAST[i]}`,
        toEmails: ["demo@example.com"],
        subject: `Re: Reinigung für ${name}`,
        bodyText: "Demo-Antwort",
        snippet: "Demo-Antwort",
        messageIdHeader: `<${randomUUID()}@example.com>`,
        inReplyTo: msgId,
        threadKey: msgId,
        receivedAt,
        createdAt: receivedAt,
        isRead: i > 2,
        aiCategory: replyCat,
        aiSentiment: ["interested", "meeting_request"].includes(replyCat) ? "positive" : replyCat === "not_interested" ? "negative" : "neutral",
        aiAnalysis: { source: "rules", category: replyCat, sentiment: "neutral", confidence: 1, summary: "DEMO – fiktive Einordnung", objectToMarketing: false, requestedCallback: false, proposedDates: [], followUpDate: null, alternativeContact: null, nextAction: "Demo" },
        aiAnalyzedAt: receivedAt,
      });
      await db.update(schema.campaignRecipients).set({ status: "replied" }).where(eq(schema.campaignRecipients.id, rec.id));
    }
    if (replyCat === "interested" || replyCat === "meeting_request") {
      const stage = (["visit_scheduled", "offer_sent", "won", "negotiation", "interested"] as const)[i % 5];
      const value = String(700 + i * 120);
      const [deal] = await db.insert(schema.deals).values({ title: `Unterhaltsreinigung ${name}`, companyId: co.id, contactId: ct.id, stage, monthlyValue: value, probability: 50, ownerId: owner?.id }).returning();
      await db.insert(schema.appointments).values({ title: "Besichtigung", startsAt: new Date(Date.now() + (i - 3) * day), companyId: co.id, contactId: ct.id, dealId: deal.id, status: i < 3 ? "done" : "planned", location: `Demostraße ${i + 1}, ${plz} Hamburg` });
      if (stage === "won" || stage === "offer_sent" || stage === "negotiation") {
        const [offer] = await db
          .insert(schema.offers)
          .values({ number: `DEMO-${i}`, title: `Unterhaltsreinigung ${name}`, companyId: co.id, contactId: ct.id, dealId: deal.id, status: stage === "won" ? "accepted" : "sent", items: [{ description: "Unterhaltsreinigung (Demo)", frequency: "5× wöchentlich", unit: "monthly", quantity: 1, unitPrice: Number(value) }], monthlyNet: value, sentAt: new Date(Date.now() - 20 * day) })
          .returning();
        if (stage === "won") {
          await db.insert(schema.contracts).values({ title: `Unterhaltsreinigung ${name}`, companyId: co.id, offerId: offer.id, dealId: deal.id, monthlyValue: value, startDate: new Date(Date.now() - 10 * day).toISOString().slice(0, 10), signedAt: new Date(Date.now() - 12 * day), ownerId: owner?.id });
          await db.update(schema.companies).set({ status: "won" }).where(eq(schema.companies.id, co.id));
        } else await db.update(schema.companies).set({ status: "offer_created" }).where(eq(schema.companies.id, co.id));
      } else await db.update(schema.companies).set({ status: "interested" }).where(eq(schema.companies.id, co.id));
      await db.insert(schema.tasks).values({ title: "Rückruf: Besichtigung abstimmen", type: "call", dueAt: new Date(Date.now() + (i - 4) * day), companyId: co.id, contactId: ct.id, assigneeId: owner?.id, priority: "high" });
    } else {
      await db.update(schema.companies).set({ status: replyCat === "not_interested" ? "not_interested" : replyCat === "later" ? "contact_later" : "contacted" }).where(eq(schema.companies.id, co.id));
    }
    await recalcCompanyScore(co.id);
  }
  console.log(`${DEMO.length} Demo-Unternehmen angelegt (Tag „Demo“).`);
}

(process.argv.includes("--remove") ? remove() : seed())
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
