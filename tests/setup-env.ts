import { randomBytes } from "node:crypto";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm_test";
process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.AUTH_SECRET ??= randomBytes(32).toString("hex");
process.env.APP_URL = "https://crm.example.test";
process.env.AI_PROVIDER = "none";
process.env.LOG_LEVEL = "error";
process.env.FINDER_OSM_ENABLED = "false";
