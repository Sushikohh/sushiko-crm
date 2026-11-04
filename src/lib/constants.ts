export const INDUSTRIES = {
  property_management: "Hausverwaltung",
  office: "Büro / Unternehmen",
  medical: "Arztpraxis / Medizin",
  fitness: "Fitnessstudio",
  daycare: "Kita",
  education: "Bildungseinrichtung",
  retail: "Einzelhandel",
  hotel: "Hotel / Beherbergung",
  business_park: "Gewerbepark",
  logistics: "Logistik",
  commercial_property: "Gewerbeimmobilie",
  other: "Sonstige",
} as const;
export type IndustryKey = keyof typeof INDUSTRIES;
export const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as IndustryKey[];

export const ACQ_STATUS = {
  new: { label: "Neu recherchiert", tone: "slate" },
  not_contacted: { label: "Noch nicht kontaktiert", tone: "slate" },
  contact_planned: { label: "Kontaktaufnahme geplant", tone: "blue" },
  contacted: { label: "Kontakt hergestellt", tone: "blue" },
  no_response: { label: "Keine Antwort", tone: "amber" },
  interested: { label: "Interessiert", tone: "green" },
  not_interested: { label: "Nicht interessiert", tone: "red" },
  contact_later: { label: "Später kontaktieren", tone: "amber" },
  visit_scheduled: { label: "Besichtigung vereinbart", tone: "violet" },
  offer_created: { label: "Angebot erstellt", tone: "violet" },
  negotiation: { label: "Verhandlung", tone: "violet" },
  won: { label: "Kunde gewonnen", tone: "green" },
  lost: { label: "Kunde verloren", tone: "red" },
  blocked: { label: "Für Werbung gesperrt", tone: "red" },
} as const;
export type AcqStatus = keyof typeof ACQ_STATUS;
export const ACQ_STATUS_KEYS = Object.keys(ACQ_STATUS) as AcqStatus[];

export const PERMISSION_BASIS = {
  none: { label: "Keine Einwilligung", tone: "slate", allowsMarketing: false },
  express_consent: { label: "Ausdrückliche Einwilligung", tone: "green", allowsMarketing: true },
  double_opt_in: { label: "Double-Opt-in bestätigt", tone: "green", allowsMarketing: true },
  existing_customer: { label: "Bestandskunde (§ 7 Abs. 3 UWG)", tone: "blue", allowsMarketing: true },
  objected: { label: "Widerspruch", tone: "red", allowsMarketing: false },
  revoked: { label: "Einwilligung widerrufen", tone: "red", allowsMarketing: false },
} as const;
export type PermissionBasisKey = keyof typeof PERMISSION_BASIS;
export const PERMISSION_KEYS = Object.keys(PERMISSION_BASIS) as PermissionBasisKey[];

export const DEAL_STAGES = {
  lead: { label: "Lead", probability: 10 },
  contacted: { label: "Kontaktiert", probability: 20 },
  interested: { label: "Interessiert", probability: 35 },
  visit_scheduled: { label: "Besichtigung", probability: 50 },
  offer_sent: { label: "Angebot versendet", probability: 65 },
  negotiation: { label: "Verhandlung", probability: 80 },
  won: { label: "Gewonnen", probability: 100 },
  lost: { label: "Verloren", probability: 0 },
} as const;
export type DealStageKey = keyof typeof DEAL_STAGES;
export const DEAL_STAGE_KEYS = Object.keys(DEAL_STAGES) as DealStageKey[];

export const CAMPAIGN_STATUS = {
  draft: "Entwurf",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  archived: "Archiviert",
} as const;

export const RECIPIENT_STATUS = {
  pending: "Wartend",
  in_progress: "Läuft",
  completed: "Sequenz beendet",
  replied: "Geantwortet",
  bounced: "Unzustellbar",
  unsubscribed: "Abgemeldet",
  skipped: "Übersprungen",
  failed: "Fehler",
} as const;

export const MESSAGE_STATUS = {
  draft: "Entwurf",
  queued: "In Warteschlange",
  sending: "Wird gesendet",
  accepted: "Vom Server angenommen",
  delivered: "Zugestellt",
  bounced: "Unzustellbar",
  failed: "Fehlgeschlagen",
  received: "Empfangen",
  cancelled: "Abgebrochen",
} as const;

export const TASK_TYPES = {
  task: "Aufgabe",
  call: "Anruf",
  follow_up: "Wiedervorlage",
  email: "E-Mail",
  site_visit: "Besichtigung",
} as const;

export const OFFER_STATUS = {
  draft: "Entwurf",
  sent: "Versendet",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
} as const;

export const CONTRACT_STATUS = {
  active: "Aktiv",
  paused: "Pausiert",
  terminated: "Gekündigt",
  ended: "Beendet",
} as const;

export const REPLY_CATEGORIES = {
  interested: { label: "Interessiert", tone: "green" },
  meeting_request: { label: "Terminwunsch", tone: "green" },
  question: { label: "Rückfrage", tone: "blue" },
  later: { label: "Später melden", tone: "amber" },
  not_interested: { label: "Kein Interesse", tone: "red" },
  unsubscribe: { label: "Abmeldung / Widerspruch", tone: "red" },
  out_of_office: { label: "Abwesenheit", tone: "slate" },
  wrong_person: { label: "Falscher Ansprechpartner", tone: "amber" },
  other: { label: "Sonstiges", tone: "slate" },
} as const;
export type ReplyCategory = keyof typeof REPLY_CATEGORIES;

export const TONE_CLASSES: Record<string, string> = {
  slate: "bg-muted text-muted-foreground border-transparent",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
};

/** Hamburger Bezirke und Stadtteile (amtliche Gliederung). */
export const HAMBURG_DISTRICTS: Record<string, string[]> = {
  "Hamburg-Mitte": ["Hamburg-Altstadt", "HafenCity", "Neustadt", "St. Pauli", "St. Georg", "Hammerbrook", "Borgfelde", "Hamm", "Horn", "Billstedt", "Billbrook", "Rothenburgsort", "Veddel", "Wilhelmsburg", "Kleiner Grasbrook", "Steinwerder", "Waltershof", "Finkenwerder", "Neuwerk"],
  Altona: ["Altona-Altstadt", "Sternschanze", "Altona-Nord", "Ottensen", "Bahrenfeld", "Groß Flottbek", "Othmarschen", "Lurup", "Osdorf", "Nienstedten", "Blankenese", "Iserbrook", "Sülldorf", "Rissen"],
  Eimsbüttel: ["Eimsbüttel", "Rotherbaum", "Harvestehude", "Hoheluft-West", "Lokstedt", "Niendorf", "Schnelsen", "Eidelstedt", "Stellingen"],
  "Hamburg-Nord": ["Hoheluft-Ost", "Eppendorf", "Groß Borstel", "Alsterdorf", "Winterhude", "Uhlenhorst", "Hohenfelde", "Barmbek-Süd", "Dulsberg", "Barmbek-Nord", "Ohlsdorf", "Fuhlsbüttel", "Langenhorn"],
  Wandsbek: ["Eilbek", "Wandsbek", "Marienthal", "Jenfeld", "Tonndorf", "Farmsen-Berne", "Bramfeld", "Steilshoop", "Wellingsbüttel", "Sasel", "Poppenbüttel", "Hummelsbüttel", "Lemsahl-Mellingstedt", "Duvenstedt", "Wohldorf-Ohlstedt", "Bergstedt", "Volksdorf", "Rahlstedt"],
  Bergedorf: ["Lohbrügge", "Bergedorf", "Curslack", "Altengamme", "Neuengamme", "Kirchwerder", "Ochsenwerder", "Reitbrook", "Allermöhe", "Billwerder", "Moorfleet", "Tatenberg", "Spadenland", "Neuallermöhe"],
  Harburg: ["Harburg", "Neuland", "Gut Moor", "Wilstorf", "Rönneburg", "Langenbek", "Sinstorf", "Marmstorf", "Eißendorf", "Heimfeld", "Moorburg", "Altenwerder", "Hausbruch", "Neugraben-Fischbek", "Francop", "Neuenfelde", "Cranz"],
};
export const HAMBURG_QUARTERS = Object.values(HAMBURG_DISTRICTS).flat().sort((a, b) => a.localeCompare(b, "de"));
