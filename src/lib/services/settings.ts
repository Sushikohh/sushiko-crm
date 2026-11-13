import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { SenderIdentity } from "@/lib/templates";
import { DEFAULT_CATALOG } from "@/lib/business/sushiko";

export const senderIdentitySchema = z.object({
  companyName: z.string().trim().min(1, "Firmenname fehlt"),
  legalForm: z.string().trim().optional().default(""),
  street: z.string().trim().min(1, "Straße fehlt"),
  postalCode: z.string().trim().regex(/^\d{5}$/, "PLZ muss 5-stellig sein"),
  city: z.string().trim().min(1, "Ort fehlt"),
  phone: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  website: z.string().trim().optional().default(""),
  managingDirector: z.string().trim().optional().default(""),
  registerInfo: z.string().trim().optional().default(""),
  vatId: z.string().trim().optional().default(""),
  taxNumber: z.string().trim().optional().default(""),
});

export const salesSettingsSchema = z.object({
  defaultFollowUpDays: z.coerce.number().int().min(1).max(60).default(5),
  noResponseAfterDays: z.coerce.number().int().min(1).max(90).default(14),
  avgContractMonths: z.coerce.number().int().min(1).max(120).default(12),
  offerPrefix: z.string().trim().default("ANG"),
});

export type SalesSettings = z.infer<typeof salesSettingsSchema>;

export const catalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name fehlt"),
  description: z.string().trim().default(""),
  pieces: z.coerce.number().int().min(0).nullable().default(null),
  priceGross: z.coerce.number().min(0).nullable().default(null),
  allergens: z.string().trim().default(""),
  category: z.enum(["menu", "buffet", "extra"]).default("menu"),
  source: z.string().trim().default("manuell"),
});

/** Produktkatalog für Angebote + Kalkulationsbasis für Buffets. */
export const catalogSettingsSchema = z.object({
  items: z.array(catalogItemSchema).max(300),
  /** Buffet-Preis pro Stück netto – nicht auf der Website veröffentlicht, daher vom Inhaber zu pflegen. */
  buffetPricePerPieceNet: z.coerce.number().min(0).nullable().default(null),
  /** Optionale Pauschale für Lieferung & Aufbau (netto). */
  setupFeeNet: z.coerce.number().min(0).nullable().default(null),
});
export type CatalogSettings = z.infer<typeof catalogSettingsSchema>;

type SettingsMap = {
  sender_identity: SenderIdentity;
  sales: SalesSettings;
  catalog: CatalogSettings;
};

const defaults: { [K in keyof SettingsMap]: SettingsMap[K] | null } = {
  sender_identity: null,
  sales: salesSettingsSchema.parse({}),
  catalog: { items: DEFAULT_CATALOG, buffetPricePerPieceNet: null, setupFeeNet: null },
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | null> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1);
  if (!row) return defaults[key];
  if (key === "sales") return salesSettingsSchema.parse(row.value) as SettingsMap[K];
  if (key === "catalog") return catalogSettingsSchema.parse(row.value) as SettingsMap[K];
  return row.value as SettingsMap[K];
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
}
