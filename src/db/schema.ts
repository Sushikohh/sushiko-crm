import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                              */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["admin", "member"]);

export const industry = pgEnum("industry", [
  "property_management",
  "office",
  "medical",
  "fitness",
  "daycare",
  "education",
  "retail",
  "hotel",
  "business_park",
  "logistics",
  "commercial_property",
  "other",
]);

/** Vertriebs-/Akquisestatus – bewusst getrennt von der Werbeerlaubnis. */
export const acquisitionStatus = pgEnum("acquisition_status", [
  "new",
  "not_contacted",
  "contact_planned",
  "contacted",
  "no_response",
  "interested",
  "not_interested",
  "contact_later",
  "visit_scheduled",
  "offer_created",
  "negotiation",
  "won",
  "lost",
  "blocked",
]);

/**
 * Rechtsgrundlage für E-Mail-Werbung (UWG § 7, DSGVO Art. 6/7).
 * Nur `express_consent`, `double_opt_in` und `existing_customer` erlauben Werbeversand.
 */
export const permissionBasis = pgEnum("permission_basis", [
  "none",
  "express_consent",
  "double_opt_in",
  "existing_customer",
  "objected",
  "revoked",
]);

export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "paused", "completed", "archived"]);
export const sendChannel = pgEnum("send_channel", ["smtp", "brevo"]);
export const recipientStatus = pgEnum("recipient_status", [
  "pending",
  "in_progress",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "skipped",
  "failed",
]);

export const messageDirection = pgEnum("message_direction", ["outbound", "inbound"]);
export const messageStatus = pgEnum("message_status", [
  "draft",
  "queued",
  "sending",
  "accepted",
  "delivered",
  "bounced",
  "failed",
  "received",
  "cancelled",
]);
export const messageKind = pgEnum("message_kind", ["campaign", "correspondence", "reply", "bounce", "auto_reply", "inbound"]);

export const dealStage = pgEnum("deal_stage", [
  "lead",
  "contacted",
  "interested",
  "visit_scheduled",
  "offer_sent",
  "negotiation",
  "won",
  "lost",
]);

export const taskType = pgEnum("task_type", ["task", "call", "follow_up", "email", "site_visit"]);
export const taskPriority = pgEnum("task_priority", ["low", "normal", "high"]);
export const appointmentStatus = pgEnum("appointment_status", ["planned", "done", "cancelled", "no_show"]);
export const offerStatus = pgEnum("offer_status", ["draft", "sent", "accepted", "rejected", "expired"]);
export const contractStatus = pgEnum("contract_status", ["active", "paused", "terminated", "ended"]);
export const activityType = pgEnum("activity_type", [
  "note",
  "call",
  "email_out",
  "email_in",
  "status_change",
  "permission_change",
  "meeting",
  "task",
  "offer",
  "contract",
  "deal",
  "import",
  "merge",
  "system",
]);

/* ------------------------------------------------------------------ */
/* Benutzer                                                            */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  /** Entspricht auth.users.id bei Supabase Auth. */
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull().default(""),
  role: userRole("role").notNull().default("member"),
  /** Nur für den lokalen Auth-Modus (AUTH_PROVIDER=local). */
  passwordHash: text("password_hash"),
  emailSignature: text("email_signature"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Unternehmen & Kontakte                                              */
/* ------------------------------------------------------------------ */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    industry: industry("industry").notNull().default("other"),
    street: text("street"),
    postalCode: text("postal_code"),
    city: text("city").default("Hamburg"),
    district: text("district"),
    website: text("website"),
    domain: text("domain"),
    phone: text("phone"),
    /** Öffentliche geschäftliche E-Mail – berechtigt NICHT automatisch zur Werbung. */
    email: text("email"),
    companySize: text("company_size"),
    employeeCount: integer("employee_count"),
    areaSqm: integer("area_sqm"),
    source: text("source").notNull().default("manual"),
    sourceRef: text("source_ref"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    notes: text("notes"),
    status: acquisitionStatus("status").notNull().default("new"),
    /** 0–100, automatisch berechnet und manuell überschreibbar. */
    potentialScore: integer("potential_score").notNull().default(0),
    potentialOverride: boolean("potential_override").notNull().default(false),
    estimatedMonthlyValue: numeric("estimated_monthly_value", { precision: 12, scale: 2 }),
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    mergedIntoId: uuid("merged_into_id"),
    lat: numeric("lat", { precision: 10, scale: 7 }),
    lon: numeric("lon", { precision: 10, scale: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("companies_status_idx").on(t.status),
    index("companies_industry_idx").on(t.industry),
    index("companies_owner_idx").on(t.ownerId),
    index("companies_normalized_name_idx").on(t.normalizedName),
    index("companies_domain_idx").on(t.domain),
    index("companies_postal_idx").on(t.postalCode),
    uniqueIndex("companies_source_ref_uq").on(t.source, t.sourceRef),
  ],
);

export const companyLocations = pgTable("company_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Standort"),
  street: text("street"),
  postalCode: text("postal_code"),
  city: text("city").default("Hamburg"),
  district: text("district"),
  areaSqm: integer("area_sqm"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    salutation: text("salutation"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    position: text("position"),
    email: text("email"),
    phone: text("phone"),
    status: acquisitionStatus("status").notNull().default("new"),
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contacts_company_idx").on(t.companyId),
    index("contacts_email_idx").on(sql`lower(${t.email})`),
    index("contacts_status_idx").on(t.status),
  ],
);

/**
 * Werbeerlaubnis pro E-Mail-Adresse – getrennt vom Vertriebsstatus.
 * Jede Änderung wird zusätzlich in permission_events protokolliert (Nachweispflicht).
 */
export const emailPermissions = pgTable(
  "email_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    basis: permissionBasis("basis").notNull().default("none"),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    source: text("source"),
    evidence: text("evidence"),
    doiToken: text("doi_token"),
    doiRequestedAt: timestamp("doi_requested_at", { withTimezone: true }),
    doiConfirmedAt: timestamp("doi_confirmed_at", { withTimezone: true }),
    doiIp: text("doi_ip"),
    recordedBy: uuid("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_permissions_email_uq").on(sql`lower(${t.email})`)],
);

export const permissionEvents = pgTable("permission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  fromBasis: permissionBasis("from_basis"),
  toBasis: permissionBasis("to_basis").notNull(),
  reason: text("reason"),
  evidence: text("evidence"),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  actorLabel: text("actor_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sperrliste: Adressen, an die niemals Werbung gesendet wird (Widerspruch, Hard Bounce, Beschwerde). */
export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suppressions_email_uq").on(sql`lower(${t.email})`)],
);

/* ------------------------------------------------------------------ */
/* Postfächer & E-Mails                                                */
/* ------------------------------------------------------------------ */

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  fromName: text("from_name"),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port").default(993),
  imapUser: text("imap_user"),
  imapPasswordEnc: text("imap_password_enc"),
  imapFolder: text("imap_folder").notNull().default("INBOX"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(465),
  smtpSecure: boolean("smtp_secure").notNull().default(true),
  smtpUser: text("smtp_user"),
  smtpPasswordEnc: text("smtp_password_enc"),
  sentFolder: text("sent_folder"),
  dailyLimit: integer("daily_limit").notNull().default(80),
  active: boolean("active").notNull().default(true),
  lastUidValidity: text("last_uid_validity"),
  lastUid: integer("last_uid").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  lastSmtpCheckAt: timestamp("last_smtp_check_at", { withTimezone: true }),
  lastSmtpError: text("last_smtp_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  status: campaignStatus("status").notNull().default("draft"),
  channel: sendChannel("channel").notNull().default("smtp"),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  targetIndustries: industry("target_industries").array().notNull().default(sql`'{}'::industry[]`),
  dailyLimit: integer("daily_limit").notNull().default(40),
  sendWindowStart: integer("send_window_start").notNull().default(8),
  sendWindowEnd: integer("send_window_end").notNull().default(17),
  sendWeekdaysOnly: boolean("send_weekdays_only").notNull().default(true),
  minDelaySeconds: integer("min_delay_seconds").notNull().default(90),
  aiPersonalize: boolean("ai_personalize").notNull().default(false),
  stopOnReply: boolean("stop_on_reply").notNull().default(true),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignSteps = pgTable(
  "campaign_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    delayDays: integer("delay_days").notNull().default(0),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
  },
  (t) => [uniqueIndex("campaign_steps_order_uq").on(t.campaignId, t.stepOrder)],
);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: recipientStatus("status").notNull().default("pending"),
    currentStep: integer("current_step").notNull().default(0),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_recipients_uq").on(t.campaignId, t.contactId),
    index("campaign_recipients_due_idx").on(t.status, t.nextSendAt),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    direction: messageDirection("direction").notNull(),
    kind: messageKind("kind").notNull(),
    status: messageStatus("status").notNull(),
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
    channel: sendChannel("channel"),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    campaignStepId: uuid("campaign_step_id").references(() => campaignSteps.id, { onDelete: "set null" }),
    recipientId: uuid("recipient_id").references(() => campaignRecipients.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    threadKey: text("thread_key"),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: text("to_emails").array().notNull().default(sql`'{}'::text[]`),
    ccEmails: text("cc_emails").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    snippet: text("snippet"),
    imapUid: integer("imap_uid"),
    providerMessageId: text("provider_message_id"),
    smtpResponse: text("smtp_response"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    bounceType: text("bounce_type"),
    isRead: boolean("is_read").notNull().default(false),
    aiCategory: text("ai_category"),
    aiSentiment: text("ai_sentiment"),
    aiAnalysis: jsonb("ai_analysis"),
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
    unsubscribeToken: text("unsubscribe_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_messages_idem_uq").on(t.idempotencyKey),
    index("email_messages_msgid_idx").on(t.messageIdHeader),
    index("email_messages_thread_idx").on(t.threadKey),
    index("email_messages_contact_idx").on(t.contactId),
    index("email_messages_company_idx").on(t.companyId),
    index("email_messages_campaign_idx").on(t.campaignId),
    index("email_messages_status_idx").on(t.direction, t.status),
    uniqueIndex("email_messages_unsub_uq").on(t.unsubscribeToken),
  ],
);

/** Zustellereignisse (SMTP, Brevo-Webhooks, DSN). provider_event_id sorgt für Idempotenz. */
export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").references(() => emailMessages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id"),
    email: text("email"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_events_provider_uq").on(t.provider, t.providerEventId)],
);

/* ------------------------------------------------------------------ */
/* Vertrieb                                                            */
/* ------------------------------------------------------------------ */

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    stage: dealStage("stage").notNull().default("lead"),
    monthlyValue: numeric("monthly_value", { precision: 12, scale: 2 }).notNull().default("0"),
    probability: integer("probability").notNull().default(10),
    expectedCloseDate: date("expected_close_date"),
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
    lostReason: text("lost_reason"),
    position: integer("position").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deals_stage_idx").on(t.stage), index("deals_company_idx").on(t.companyId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    type: taskType("type").notNull().default("task"),
    priority: taskPriority("priority").notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => profiles.id, { onDelete: "set null" }),
    source: text("source").notNull().default("manual"),
    sourceKey: text("source_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_due_idx").on(t.completedAt, t.dueAt),
    uniqueIndex("tasks_source_key_uq").on(t.sourceKey),
  ],
);

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  type: text("type").notNull().default("site_visit"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: text("location"),
  notes: text("notes"),
  outcome: text("outcome"),
  status: appointmentStatus("status").notNull().default("planned"),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OfferItem = {
  description: string;
  areaSqm?: number | null;
  frequency: string;
  unit: "monthly" | "one_time";
  quantity: number;
  unitPrice: number;
};

export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  title: text("title").notNull(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  status: offerStatus("status").notNull().default("draft"),
  items: jsonb("items").$type<OfferItem[]>().notNull().default(sql`'[]'::jsonb`),
  monthlyNet: numeric("monthly_net", { precision: 12, scale: 2 }).notNull().default("0"),
  oneTimeNet: numeric("one_time_net", { precision: 12, scale: 2 }).notNull().default("0"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("19"),
  validUntil: date("valid_until"),
  introText: text("intro_text"),
  terms: text("terms"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  status: contractStatus("status").notNull().default("active"),
  monthlyValue: numeric("monthly_value", { precision: 12, scale: 2 }).notNull().default("0"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  noticePeriodMonths: integer("notice_period_months").notNull().default(3),
  serviceScope: text("service_scope"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: activityType("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => emailMessages.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_company_idx").on(t.companyId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Automatisierungen, Benachrichtigungen, Einstellungen               */
/* ------------------------------------------------------------------ */

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  trigger: text("trigger").notNull(),
  conditions: jsonb("conditions").notNull().default(sql`'{}'::jsonb`),
  actions: jsonb("actions").notNull().default(sql`'[]'::jsonb`),
  enabled: boolean("enabled").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    status: text("status").notNull(),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("automation_runs_event_uq").on(t.automationId, t.eventKey)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    level: text("level").notNull().default("info"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignStep = typeof campaignSteps.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type Mailbox = typeof mailboxes.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type EmailPermission = typeof emailPermissions.$inferSelect;
