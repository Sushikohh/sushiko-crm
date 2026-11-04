import type { NextConfig } from "next";

/**
 * Architekturentscheidung: Cache Components sind deaktiviert. Jede Seite dieser internen,
 * vollständig authentifizierten Anwendung zeigt benutzer- und zeitabhängige Live-Daten;
 * statische Shells bringen hier keinen Vorteil (siehe docs/ARCHITEKTUR.md).
 */
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg-boss", "imapflow", "mailparser", "nodemailer", "postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
