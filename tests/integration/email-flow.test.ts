import fs from "node:fs";
import path from "node:path";
import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Queue im Test durch einen Rekorder ersetzen (pg-boss wird separat getestet)
const enqueued: { name: string; data: Record<string, unknown> }[] = [];
vi.mock("@/lib/queue", async (orig) => {
  const actual = await orig<typeof import("@/lib/queue")>();
  return {
    ...actual,
    enqueue: vi.fn(async (name: string, data: Record<string, unknown>) => {
      enqueued.push({ name, data });
      return "job-id";
    }),
  };
});

const { db, schema, closeDb } = await import("@/db");
const { encryptSecret } = await import("@/lib/crypto");
const { setSetting } = await import("@/lib/services/settings");
const { createCompany } = await import("@/lib/services/companies");
const { createContact } = await import("@/lib/services/contacts");
const { setPermission, isSuppressed, getPermission } = await import("@/lib/services/permissions");
const { saveCampaign, addRecipients, startCampaign, campaignTick } = await import("@/lib/services/campaigns");
const { processSendJob, ingestInbound, unsubscribeByToken, processBrevoEvent } = await import("@/lib/services/email");
const { analyzeMessageJob } = await import("@/lib/services/inbox");
const { ensureDefaultAutomations, runAutomationEvent } = await import("@/lib/services/automations");
const { getKpis } = await import("@/lib/services/analytics");
const { toParsedInbound } = await import("@/lib/mail/imap");

const received: ParsedMail[] = [];
let server: SMTPServer;
let port = 0;

beforeAll(async () => {
  // Lokaler SMTP-Server mit implizitem TLS; lehnt "unbekannt@" mit 550 ab (wie ein echter Empfängerserver)
  server = new SMTPServer({
    secure: true,
    key: fs.readFileSync(path.join(process.cwd(), "tests/fixtures/localhost.key")),
    cert: fs.readFileSync(path.join(process.cwd(), "tests/fixtures/localhost.crt")),
    authMethods: ["PLAIN", "LOGIN"],
    onAuth(auth, _s, cb) {
      if (auth.username === "info@glanz-test.de" && auth.password === "pw-123") cb(null, { user: auth.username });
      else cb(new Error("Invalid credentials"));
    },
    onRcptTo(addr, _s, cb) {
      if (addr.address.startsWith("unbekannt@")) {
        const err = new Error("5.1.1 User unknown") as Error & { responseCode: number };
        err.responseCode = 550;
        return cb(err);
      }
      cb();
    },
    onData(stream, _s, cb) {
      simpleParser(stream).then((m) => {
        received.push(m);
        cb();
      }, cb);
    },
    logger: false,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.server.address() as { port: number }).port;

  await setSetting("sender_identity", { companyName: "Sushiko Hamburg", legalForm: "GmbH", street: "Hafenstraße 1", postalCode: "20459", city: "Hamburg", phone: "040 123", email: "info@glanz-test.de" });
  await db.insert(schema.mailboxes).values({
    name: "Test",
    email: "info@glanz-test.de",
    fromName: "Glanz Test",
    smtpHost: "localhost",
    smtpPort: port,
    smtpSecure: true,
    smtpUser: "info@glanz-test.de",
    smtpPasswordEnc: encryptSecret("pw-123"),
    imapHost: "localhost",
    imapUser: "x",
    imapPasswordEnc: encryptSecret("x"),
  });
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await closeDb();
});

describe("Kampagne → Versand → Antwort → Abmeldung", () => {
  const ids: Record<string, string> = {};

  it("legt Firma und Kontakte an; Werbeerlaubnis getrennt vom Status", async () => {
    const co = await createCompany({ name: "Alster Werbung GmbH", industry: "agency", postalCode: "20095", website: "alster-hv.de", employeeCount: 60 }, null);
    ids.company = co.id;
    const a = await createContact({ companyId: co.id, salutation: "Frau", firstName: "Anna", lastName: "Alster", email: "anna@alster-hv.de", position: "Office Managerin" }, null);
    const b = await createContact({ companyId: co.id, firstName: "Bernd", lastName: "Ohne", email: "bernd@alster-hv.de" }, null);
    const c = await createContact({ companyId: co.id, firstName: "Carla", lastName: "Falsch", email: "unbekannt@alster-hv.de" }, null);
    Object.assign(ids, { anna: a.id, bernd: b.id, carla: c.id });
    for (const e of [a.email!, c.email!]) await setPermission({ email: e, basis: "express_consent", grantedAt: new Date("2026-10-01"), evidence: "Einwilligung per Formular, Ref 42", actorLabel: "Test" });
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, co.id));
    expect(company.potentialScore).toBeGreaterThan(40);
  });

  it("fügt nur berechtigte Empfänger hinzu", async () => {
    ids.campaign = await saveCampaign(
      null,
      {
        name: "Test-Kampagne",
        dailyLimit: 50,
        sendWindowStart: 0,
        sendWindowEnd: 24,
        sendWeekdaysOnly: false,
        minDelaySeconds: 10,
        steps: [
          { delayDays: 0, subject: "Sushi für {{firma}}", body: "{{anrede}},\n\nwir möchten Ihnen unser Angebot vorstellen.\n\nViele Grüße" },
          { delayDays: 5, subject: "Re: Sushi für {{firma}}", body: "{{anrede}},\n\nkurze Nachfrage." },
        ],
      },
      (await db.insert(schema.profiles).values({ email: "chef@glanz-test.de", fullName: "Chef" }).returning())[0].id,
    );
    const r = await addRecipients(ids.campaign, [ids.anna, ids.bernd, ids.carla]);
    expect(r).toEqual({ added: 2, skipped: 1 });
    const [skipped] = await db.select().from(schema.campaignRecipients).where(and(eq(schema.campaignRecipients.contactId, ids.bernd)));
    expect(skipped.status).toBe("skipped");
    expect(skipped.skipReason).toContain("Keine nachgewiesene Werbeeinwilligung");
  });

  it("Kampagnen-Takt reiht E-Mails ein und versendet über SMTP (TLS)", async () => {
    await startCampaign(ids.campaign);
    const res = await campaignTick(new Date());
    expect(res[ids.campaign]).toBe(2);
    const sendJobs = enqueued.filter((j) => j.name === "email.send");
    expect(sendJobs).toHaveLength(2);
    const results = [];
    for (const j of sendJobs) results.push(await processSendJob(j.data.messageId as string));
    expect(results.map((r) => r.status).sort()).toEqual(["accepted", "bounced"]);

    expect(received).toHaveLength(1);
    const mail = received[0];
    expect(mail.subject).toBe("Sushi für Alster Werbung GmbH");
    expect(mail.text).toContain("Sehr geehrte Frau Alster");
    expect(mail.text).toContain("Sushiko Hamburg GmbH");
    expect(mail.text).toContain("https://crm.example.test/u/");
    const lu = mail.headerLines.find((h) => h.key === "list-unsubscribe")?.line ?? "";
    expect(lu).toContain("https://crm.example.test/u/");
    expect(mail.headerLines.find((h) => h.key === "list-unsubscribe-post")?.line).toContain("List-Unsubscribe=One-Click");

    // Hard Bounce durch SMTP-Ablehnung → gesperrt
    expect(await isSuppressed("unbekannt@alster-hv.de")).toBe(true);
    const [rc] = await db.select().from(schema.campaignRecipients).where(eq(schema.campaignRecipients.contactId, ids.carla));
    expect(rc.status).toBe("bounced");

    // Kontaktstatus wurde auf „Kontakt hergestellt“ gesetzt
    const [anna] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, ids.anna));
    expect(anna.status).toBe("contacted");
  });

  it("ist idempotent: erneute Verarbeitung sendet nicht doppelt", async () => {
    const [m] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.contactId, ids.anna));
    const r = await processSendJob(m.id);
    expect(r.status).toBe("accepted");
    expect(received).toHaveLength(1);
    // Tick am selben Tag erzeugt für Schritt 1 keinen weiteren Versand (Schritt 2 erst in 5 Tagen)
    enqueued.length = 0;
    await campaignTick(new Date(Date.now() + 60_000));
    expect(enqueued.filter((j) => j.name === "email.send")).toHaveLength(0);
  });

  it("ordnet eingehende Antwort dem Thread zu und stoppt die Sequenz", async () => {
    const [sent] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.contactId, ids.anna));
    const raw = `From: Anna Alster <anna@alster-hv.de>\r\nTo: info@glanz-test.de\r\nSubject: Re: ${sent.subject}\r\nMessage-ID: <reply-1@alster-hv.de>\r\nIn-Reply-To: ${sent.messageIdHeader}\r\nDate: ${new Date().toUTCString()}\r\n\r\nGuten Tag, gern können Sie zu einer Besichtigung vorbeikommen.\r\n\r\nAm Montag schrieb Glanz:\r\n> Alter Text\r\n`;
    const [mb] = await db.select().from(schema.mailboxes);
    enqueued.length = 0;
    const r = await ingestInbound(mb.id, toParsedInbound(await simpleParser(raw)), 101);
    expect(r?.kind).toBe("reply");
    // Duplikat (gleiche Message-ID) wird ignoriert
    expect(await ingestInbound(mb.id, toParsedInbound(await simpleParser(raw)), 101)).toBeNull();
    const [msg] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, r!.id));
    expect(msg.contactId).toBe(ids.anna);
    expect(msg.companyId).toBe(ids.company);
    expect(msg.threadKey).toBe(sent.threadKey);
    const [rec] = await db.select().from(schema.campaignRecipients).where(eq(schema.campaignRecipients.contactId, ids.anna));
    expect(rec.status).toBe("replied");
    expect(enqueued.map((e) => e.name)).toEqual(expect.arrayContaining(["ai.analyze-reply", "automation.event"]));
    ids.reply = r!.id;
  });

  it("Automatisierung „Interessent“ legt Deal und Aufgabe genau einmal an", async () => {
    await ensureDefaultAutomations();
    const payload = { event: "reply.classified" as const, eventKey: `classified:${ids.reply}`, companyId: ids.company, contactId: ids.anna, messageId: ids.reply, data: { category: "meeting_request" } };
    const r1 = await runAutomationEvent(payload);
    const r2 = await runAutomationEvent(payload);
    expect(r1).toEqual([{ automation: "Interessent: Deal & Rückruf", status: "success" }]);
    expect(r2).toEqual([]);
    const deals = await db.select().from(schema.deals).where(eq(schema.deals.companyId, ids.company));
    expect(deals).toHaveLength(1);
    expect(deals[0].stage).toBe("interested");
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.companyId, ids.company));
    expect(tasks).toHaveLength(1);
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, ids.company));
    expect(company.status).toBe("interested");
  });

  it("erkennt Abmeldung per E-Mail auch ohne KI und sperrt die Adresse", async () => {
    const [mb] = await db.select().from(schema.mailboxes);
    const raw = `From: Anna Alster <anna@alster-hv.de>\r\nTo: info@glanz-test.de\r\nSubject: Re: Sushi\r\nMessage-ID: <reply-2@alster-hv.de>\r\nIn-Reply-To: <reply-1@alster-hv.de>\r\n\r\nBitte senden Sie mir keine weiteren E-Mails.\r\n`;
    const r = await ingestInbound(mb.id, toParsedInbound(await simpleParser(raw)), 102);
    const a = await analyzeMessageJob(r!.id);
    expect(a).toMatchObject({ category: "unsubscribe", objection: true });
    expect((await getPermission("anna@alster-hv.de"))?.basis).toBe("objected");
    expect(await isSuppressed("anna@alster-hv.de")).toBe(true);
    const events = await db.select().from(schema.permissionEvents).where(sql`lower(email) = 'anna@alster-hv.de'`);
    expect(events.map((e) => e.toBasis)).toEqual(expect.arrayContaining(["express_consent", "objected"]));
  });

  it("verarbeitet DSN-Bounces aus dem Posteingang", async () => {
    const [mb] = await db.select().from(schema.mailboxes);
    const co = await createCompany({ name: "Fitness Nord", industry: "fitness" }, null);
    const ct = await createContact({ companyId: co.id, firstName: "Dirk", email: "dirk@fitness-nord.de" }, null);
    const [out] = await db
      .insert(schema.emailMessages)
      .values({ direction: "outbound", kind: "correspondence", status: "accepted", mailboxId: mb.id, contactId: ct.id, companyId: co.id, fromEmail: mb.email, toEmails: ["dirk@fitness-nord.de"], subject: "Lieferung", messageIdHeader: "<out-77@glanz-test.de>", sentAt: new Date() })
      .returning();
    const dsn = `From: MAILER-DAEMON@mx.fitness-nord.de\r\nTo: info@glanz-test.de\r\nSubject: Undelivered Mail Returned to Sender\r\nMessage-ID: <dsn-77@mx>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=delivery-status; boundary="B"\r\n\r\n--B\r\nContent-Type: text/plain\r\n\r\nfailed\r\n--B\r\nContent-Type: message/delivery-status\r\n\r\nFinal-Recipient: rfc822; dirk@fitness-nord.de\r\nStatus: 5.1.1\r\n\r\n--B\r\nContent-Type: text/rfc822-headers\r\n\r\nMessage-ID: <out-77@glanz-test.de>\r\n\r\n--B--\r\n`;
    const r = await ingestInbound(mb.id, toParsedInbound(await simpleParser(dsn)), 103);
    expect(r?.kind).toBe("bounce");
    const [o] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, out.id));
    expect(o.status).toBe("bounced");
    expect(await isSuppressed("dirk@fitness-nord.de")).toBe(true);
  });

  it("Abmeldelink und Brevo-Webhook sind idempotent", async () => {
    const [m] = await db.select().from(schema.emailMessages).where(and(eq(schema.emailMessages.kind, "campaign"), eq(schema.emailMessages.status, "accepted")));
    const u = await unsubscribeByToken(m.unsubscribeToken!, { ip: "127.0.0.1", method: "Test" });
    expect(u?.email).toBe("anna@alster-hv.de");
    expect(await unsubscribeByToken("ungueltig", { ip: null, method: "Test" })).toBeNull();
    const ev = { event: "delivered", email: "anna@alster-hv.de", "message-id": m.messageIdHeader!, ts_event: 1 };
    expect(await processBrevoEvent(ev)).toMatchObject({ duplicate: false });
    expect(await processBrevoEvent(ev)).toMatchObject({ duplicate: true });
  });

  it("Kennzahlen stammen aus den gespeicherten Daten", async () => {
    const k = await getKpis({});
    expect(k).toMatchObject({ companies: 2, contacts: 4, sent: 3, accepted: 1, bounced: 2, replies: 2, permittedContacts: 0 });
  });
});
