import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Setzt die Test-Datenbank vollständig zurück und wendet alle Migrationen an. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_test";
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; drop schema if exists pgboss cascade; create schema public;");
  await migrate(drizzle(client), { migrationsFolder: "./supabase/migrations" });
  await client.end();
}
