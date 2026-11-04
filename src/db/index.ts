import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

/**
 * Gemeinsamer Postgres-Client für Next.js-Server und Worker.
 * Lazy erzeugt, damit `next build` ohne Datenbank funktioniert.
 */
function getClient() {
  if (!globalThis.__pg) {
    globalThis.__pg = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_SIZE,
      // Supabase-Pooler (Transaction-Modus) unterstützt keine Prepared Statements
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalThis.__pg;
}

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;
let _db: DrizzleDB | undefined;

export const db: DrizzleDB = new Proxy({} as DrizzleDB, {
  get(_t, prop) {
    if (!_db) _db = drizzle(getClient(), { schema });
    const value = Reflect.get(_db, prop);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});

export type DB = DrizzleDB;
export type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];
/** Datenbank oder laufende Transaktion. */
export type Conn = DrizzleDB | Tx;
export async function closeDb() {
  await globalThis.__pg?.end({ timeout: 5 });
  globalThis.__pg = undefined;
  _db = undefined;
}
export { schema };
