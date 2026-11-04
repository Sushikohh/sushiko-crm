import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DECISION_MAKER_PATTERN, scoreCompany } from "@/lib/scoring";
import { eligibilityForContacts } from "./permissions";

export async function getCompanyDetail(id: string) {
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, id));
  if (!company) return null;
  const [contacts, locations, activities, messages, tasks, appointments, deals, offers, contracts, owner] = await Promise.all([
    db.select().from(schema.contacts).where(eq(schema.contacts.companyId, id)).orderBy(desc(schema.contacts.isPrimary), asc(schema.contacts.lastName)),
    db.select().from(schema.companyLocations).where(eq(schema.companyLocations.companyId, id)).orderBy(asc(schema.companyLocations.createdAt)),
    db
      .select({ a: schema.activities, userName: schema.profiles.fullName })
      .from(schema.activities)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.activities.userId))
      .where(eq(schema.activities.companyId, id))
      .orderBy(desc(schema.activities.createdAt))
      .limit(200),
    db.select().from(schema.emailMessages).where(eq(schema.emailMessages.companyId, id)).orderBy(desc(schema.emailMessages.createdAt)).limit(100),
    db
      .select({ t: schema.tasks, assignee: schema.profiles.fullName })
      .from(schema.tasks)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.tasks.assigneeId))
      .where(eq(schema.tasks.companyId, id))
      .orderBy(sql`${schema.tasks.completedAt} is not null`, asc(schema.tasks.dueAt)),
    db.select().from(schema.appointments).where(eq(schema.appointments.companyId, id)).orderBy(desc(schema.appointments.startsAt)),
    db.select().from(schema.deals).where(eq(schema.deals.companyId, id)).orderBy(desc(schema.deals.createdAt)),
    db.select().from(schema.offers).where(eq(schema.offers.companyId, id)).orderBy(desc(schema.offers.createdAt)),
    db.select().from(schema.contracts).where(eq(schema.contracts.companyId, id)).orderBy(desc(schema.contracts.startDate)),
    company.ownerId ? db.select().from(schema.profiles).where(eq(schema.profiles.id, company.ownerId)).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const eligibility = await eligibilityForContacts(contacts.map((c) => c.id));
  const score = scoreCompany({
    industry: company.industry,
    employeeCount: company.employeeCount,
    areaSqm: company.areaSqm,
    companySize: company.companySize,
    hasWebsite: !!company.website,
    hasPhone: !!company.phone,
    contactCount: contacts.length,
    hasDecisionMaker: contacts.some((c) => c.position && DECISION_MAKER_PATTERN.test(c.position)),
    locationCount: locations.length + 1,
    city: company.city,
  });
  const mergedInto = company.mergedIntoId ? (await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, company.mergedIntoId)))[0] : null;
  return { company, contacts, locations, activities, messages, tasks, appointments, deals, offers, contracts, owner, eligibility, score, mergedInto };
}

export async function getContactDetail(id: string) {
  const [row] = await db
    .select({ contact: schema.contacts, company: schema.companies })
    .from(schema.contacts)
    .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
    .where(eq(schema.contacts.id, id));
  if (!row) return null;
  const email = row.contact.email?.toLowerCase();
  const [permission, permissionEvents, suppression, messages, activities, recipients] = await Promise.all([
    email ? db.select().from(schema.emailPermissions).where(sql`lower(${schema.emailPermissions.email}) = ${email}`).then((r) => r[0] ?? null) : null,
    email
      ? db
          .select({ e: schema.permissionEvents, actor: schema.profiles.fullName })
          .from(schema.permissionEvents)
          .leftJoin(schema.profiles, eq(schema.profiles.id, schema.permissionEvents.actorId))
          .where(sql`lower(${schema.permissionEvents.email}) = ${email}`)
          .orderBy(desc(schema.permissionEvents.createdAt))
      : [],
    email ? db.select().from(schema.suppressions).where(sql`lower(${schema.suppressions.email}) = ${email}`).then((r) => r[0] ?? null) : null,
    db
      .select()
      .from(schema.emailMessages)
      .where(or(eq(schema.emailMessages.contactId, id), email ? sql`lower(${schema.emailMessages.fromEmail}) = ${email}` : undefined))
      .orderBy(desc(schema.emailMessages.createdAt))
      .limit(100),
    db
      .select({ a: schema.activities, userName: schema.profiles.fullName })
      .from(schema.activities)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.activities.userId))
      .where(eq(schema.activities.contactId, id))
      .orderBy(desc(schema.activities.createdAt))
      .limit(200),
    db
      .select({ r: schema.campaignRecipients, campaign: schema.campaigns.name })
      .from(schema.campaignRecipients)
      .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignRecipients.campaignId))
      .where(eq(schema.campaignRecipients.contactId, id)),
  ]);
  const eligibility = (await eligibilityForContacts([id])).get(id) ?? null;
  return { ...row, permission, permissionEvents, suppression, messages, activities, recipients, eligibility };
}

export async function companyOptions(limit = 2000) {
  return db
    .select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies)
    .where(isNull(schema.companies.mergedIntoId))
    .orderBy(asc(schema.companies.name))
    .limit(limit);
}

export async function contactOptions(companyIds?: string[]) {
  const rows = await db
    .select({ id: schema.contacts.id, first: schema.contacts.firstName, last: schema.contacts.lastName, email: schema.contacts.email, companyId: schema.contacts.companyId })
    .from(schema.contacts)
    .where(companyIds ? and(inArray(schema.contacts.companyId, companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"])) : undefined)
    .orderBy(asc(schema.contacts.lastName))
    .limit(3000);
  return rows.map((r) => ({ id: r.id, name: `${r.first} ${r.last}`.trim() || r.email || "Kontakt", companyId: r.companyId, email: r.email }));
}
