import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
// Selbstsigniertes Test-Zertifikat für den lokalen SMTP-Testserver (vor dem Start der Test-Worker setzen)
process.env.NODE_EXTRA_CA_CERTS = path.join(root, "tests/fixtures/localhost.crt");

export default defineConfig({
  resolve: { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup-env.ts"],
    // Integrationstests teilen sich eine Datenbank → nacheinander ausführen
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
