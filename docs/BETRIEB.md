# Betrieb & Deployment

## 1. Supabase (EU)

1. Projekt anlegen, Region **Central EU (Frankfurt)**.
2. **Datenbank:** Unter *Project Settings → Database* den Connection String des **Session Poolers** (Port 5432) als `DATABASE_URL` eintragen. Er verwendet die Rolle `postgres` und wird nur serverseitig genutzt.
3. **Auth:** Unter *Authentication → Providers* E-Mail/Passwort aktivieren und die öffentliche Registrierung deaktivieren (*Allow new users to sign up* = aus). Werte setzen:
   - `AUTH_PROVIDER=supabase`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (für Einladungen aus der App)
4. Migrationen ausführen (siehe unten). Sie legen RLS-Policies und einen Trigger an, der für neue Supabase-Benutzer ein Profil erzeugt. Der **erste Benutzer wird Administrator**.
5. Den ersten Benutzer im Supabase-Dashboard einladen (*Authentication → Users → Invite*). Weitere Benutzer kommen danach über die App (*Einstellungen → Team*).

## 2. Docker (z. B. Hetzner/IONOS-Server in Deutschland)

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```

- `migrate` läuft einmal: Migrationen und pg-boss-Schema.
- `web` ist die Next.js-App auf Port 3000. Davor einen Reverse Proxy mit TLS schalten (Caddy, Traefik oder nginx).
- `worker` übernimmt Versand, IMAP-Abruf, KI, Kampagnen, Automatisierungen und Wartung. Mehrere Worker-Instanzen sind möglich; Cron-Jobs löst trotzdem nur eine Instanz aus.

Health-Check: `GET /api/health`.

Ohne Docker:

```bash
npm ci
```

```bash
npm run build
```

```bash
npm run db:migrate
```

```bash
npm start
```

```bash
npm run worker
```

Den Worker in Produktion unter einem Prozessmanager betreiben, z. B. als systemd-Dienst.

> Plattformen ohne dauerhafte Prozesse (z. B. Vercel) eignen sich nur für die Web-App. Der Worker braucht einen dauerhaft laufenden Prozess, etwa einen kleinen Server oder Container in der EU.

## 3. Geschäftliches Postfach

Unter *Einstellungen → E-Mail* IMAP- und SMTP-Daten Ihres Anbieters eintragen und **Verbindung testen**. Für gängige Anbieter (IONOS, STRATO, Hetzner, All-Inkl, Microsoft 365, Google Workspace, mailbox.org) gibt es Vorlagen. Es werden nur TLS-Verbindungen unterstützt:

| Protokoll | Port | Verschlüsselung |
|---|---|---|
| IMAP | 993 | TLS |
| SMTP | 465 | TLS |
| SMTP | 587 | STARTTLS, erzwungen |

Empfehlungen für eine gute Zustellbarkeit:

- **SPF, DKIM und DMARC** für Ihre Domain beim Hosting-Anbieter einrichten.
- Moderate Tageslimits wählen, bei neuen Domains mit 20–40 pro Tag beginnen.
- Einen Abstand von mindestens 60–90 Sekunden zwischen Kampagnen-E-Mails einhalten.

Microsoft 365 und Google Workspace verlangen für SMTP/IMAP gegebenenfalls ein App-Passwort bzw. eine aktivierte Basic-Auth-Ausnahme.

## 4. Brevo (optional)

1. `BREVO_API_KEY` setzen. Die Absenderdomain in Brevo verifizieren (SPF/DKIM).
2. `BREVO_WEBHOOK_SECRET` setzen und in Brevo einen Webhook auf `https://<APP_URL>/api/webhooks/brevo?token=<SECRET>` anlegen. Ereignisse: delivered, hard bounce, soft bounce, blocked, spam, unsubscribed.
3. In der Kampagne den Versandweg „Brevo API“ wählen.

## 5. KI

- `AI_PROVIDER=anthropic` mit `ANTHROPIC_API_KEY`. Das Modell legt `ANTHROPIC_MODEL` fest, Standard ist `claude-opus-5-5`.
- Alternativ `AI_PROVIDER=openai` mit `OPENAI_API_KEY`.

Genutzt wird die KI für die Antwortanalyse (Kategorie, Stimmung, Zusammenfassung, Folgetermin, Widerspruch), für Antwortentwürfe und für die optionale Personalisierung von Kampagnen. Alle Ausgaben werden validiert. Schließen Sie einen AVV mit dem Anbieter ab.

## 6. Sicherheit

- `APP_ENCRYPTION_KEY` (AES-256-GCM für Postfach-Passwörter) sicher aufbewahren. Ohne ihn lassen sich die gespeicherten Passwörter nicht mehr entschlüsseln.
- Security-Header (HSTS, X-Frame-Options, nosniff) sind gesetzt.
- Das Login hat einen Schutz gegen Brute-Force-Versuche.
- Exporte und Konfigurationsänderungen stehen im `audit_log`.
- Backups: Supabase Point-in-Time-Recovery aktivieren oder regelmäßig `pg_dump` ausführen.
