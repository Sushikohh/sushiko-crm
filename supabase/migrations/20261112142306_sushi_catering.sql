-- Umstellung auf B2B-Sushi-Catering (Sushiko Hamburg)

-- Zielbranchen: nicht passende Reinigungs-Branchen in Catering-Zielgruppen umbenennen
ALTER TYPE "public"."industry" RENAME VALUE 'property_management' TO 'agency';--> statement-breakpoint
ALTER TYPE "public"."industry" RENAME VALUE 'daycare' TO 'tech';--> statement-breakpoint
ALTER TYPE "public"."industry" RENAME VALUE 'business_park' TO 'coworking';--> statement-breakpoint
ALTER TYPE "public"."industry" RENAME VALUE 'logistics' TO 'consulting';--> statement-breakpoint
ALTER TYPE "public"."industry" RENAME VALUE 'commercial_property' TO 'event_agency';--> statement-breakpoint

-- Besichtigung → Verkostung
ALTER TYPE "public"."task_type" RENAME VALUE 'site_visit' TO 'tasting';--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "type" SET DEFAULT 'tasting';--> statement-breakpoint
UPDATE "appointments" SET "type" = 'tasting' WHERE "type" = 'site_visit';--> statement-breakpoint

-- Reinigungsfläche → Gästezahl / Mitarbeitende am Standort
ALTER TABLE "companies" RENAME COLUMN "area_sqm" TO "event_guests";--> statement-breakpoint
ALTER TABLE "company_locations" RENAME COLUMN "area_sqm" TO "headcount";--> statement-breakpoint

-- Angebote: Eventdaten, Personenzahl, Lieferadresse, Allergene; USt.-Standard 7 % (Speisenlieferung)
ALTER TABLE "offers" ADD COLUMN "event_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "guest_count" integer;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "dietary_notes" text;--> statement-breakpoint
ALTER TABLE "offers" ALTER COLUMN "vat_rate" SET DEFAULT '7';--> statement-breakpoint
UPDATE "offers" SET "items" = (
  SELECT coalesce(jsonb_agg((i - 'areaSqm') || jsonb_build_object('persons', i -> 'areaSqm')), '[]'::jsonb)
  FROM jsonb_array_elements("items") AS i
) WHERE jsonb_typeof("items") = 'array' AND jsonb_array_length("items") > 0;
