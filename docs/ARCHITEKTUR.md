# Architektur & Entscheidungen

## Überblick

```
Browser ──► Next.js (App Router, Server Components, Server Actions, Route Handler)
                │            │
                │            └─► pg-boss (Jobs einreihen)
                ▼
          PostgreSQL / Supabase  ◄──  Worker-Prozess (pg-boss)
                                        ├─ email.send        → SMTP (TLS) / Brevo API
                                        ├─ mailbox.sync      → IMAP (TLS) → Zuordnung, Bounces
                                        ├─ ai.analyze-reply  → Anthropic / OpenAI (Zod-validiert)
                                        ├─ campaign.tick     (minütlich)
                                        ├─ automation.event  (idempotent)
                                        └─ maintenance.daily (05:15 Europe/Berlin)
```

| Ordner | Inhalt |
|---|---|
| `src/db/schema.ts` | Datenmodell (Drizzle). SQL-Migrationen in `supabase/migrations`, inkl. RLS, Volltextindizes und Auth-Trigger. |
| `src/lib/*` | Fachlogik ohne UI. Pure Module (`compliance`, `templates`, `mail/classify`, `finder/*`, `scoring`) und DB-Services (`services/*`). Web-App und Worker nutzen sie gemeinsam. |
| `src/server/actions/*` | Server Actions: Authentifizierung, Zod-Validierung, einheitliches Fehlerformat. |
| `src/app/(app)/*` | Seiten (deutsche URLs). |
| `worker/index.ts` | Hintergrundprozess. |

## Entscheidungen

1. **Drizzle ORM + direkte Postgres-Verbindung statt Supabase-JS für Daten.** Web-App und Worker greifen nur serverseitig zu. Das bringt durchgängige Typen, Transaktionen und komplexe SQL-Auswertungen. Supabase dient als verwaltetes Postgres (EU-Region) und als Auth-Anbieter. RLS ist trotzdem auf allen Tabellen aktiv (Defense in Depth): Über die Supabase-API mit dem anon key ist nichts lesbar. Rechtlich sensible Tabellen (Einwilligungen, Sperrliste) sind auch für angemeldete Nutzer über die API nur lesbar.
2. **Supabase Auth mit lokalem Fallback.** `AUTH_PROVIDER=supabase` ist für Produktion empfohlen. `local` (bcrypt + signiertes httpOnly-Cookie) erlaubt Entwicklung, Tests und Betrieb ohne Supabase. Jede Seite und jede Server Action prüft die Session selbst; der Next.js-Proxy macht nur eine optimistische Weiterleitung.
3. **pg-boss als Queue.** Die Jobs liegen persistent in derselben Datenbank, also ohne zusätzlichen Redis. Eingebaut sind Retry mit exponentiellem Backoff, Singleton-Keys und Cron mit Leaderwahl bei mehreren Worker-Instanzen.
4. **Idempotenz an jeder Stelle:**
   - Versand: atomarer Statuswechsel `queued → sending` und `idempotency_key` je Kampagnenschritt.
   - Eingang: (Postfach, Message-ID) ist eindeutig.
   - Zustellereignisse: `(provider, provider_event_id)` ist eindeutig.
   - Automatisierungen: `(automation_id, event_key)` ist eindeutig.
   - Aufgaben aus Automatisierungen: `source_key` ist eindeutig.
5. **Rechtsprüfung als reine Funktion** (`lib/compliance.ts`). Sie läuft beim Hinzufügen von Empfängern, beim Einreihen und noch einmal unmittelbar vor jedem einzelnen Versand im Worker.
6. **Cache Components deaktiviert.** Alle Seiten sind benutzerbezogen und zeigen Live-Daten. Statische Shells bringen hier keinen Nutzen und würden die Fehlersuche bei Auth und Session erschweren.
7. **Natives `<select>` statt Radix-Select** in Formularen: robust, barrierefrei, mobil komfortabel. Die übrigen Bausteine (Dialog, Dropdown, Tabs, Popover, Switch, Checkbox, Command-Palette) folgen shadcn/ui auf Radix-Basis. Die shadcn-CLI war in der Entwicklungsumgebung nicht erreichbar, deshalb liegen die Komponenten direkt im Repo.
8. **KI-Ausgaben strukturiert.** Anthropic läuft über `messages.parse` mit Zod-Schema und serverseitigem Fallback bei Ablehnungen (`fallbacks: "default"`); OpenAI über JSON-Schema. Ohne Schlüssel bleiben die KI-Funktionen deaktiviert und sind als „Nicht verbunden“ gekennzeichnet. Abmeldewünsche werden zusätzlich immer regelbasiert erkannt.
9. **Firmenfinder über OpenStreetMap.** Die Daten sind frei lizenziert (ODbL), Abfragen laufen über die offizielle Overpass-API mit identifizierendem User-Agent. Es gibt kein Website-Scraping. Weitere Quellen (z. B. lizenzierte Adressdaten) kommen per CSV.
10. **Diagrammfarben** stammen aus einer validierten, farbenblind-sicheren Palette mit eigenen Werten für den Dunkelmodus. Jedes Diagramm hat eine umschaltbare Tabellenansicht.

## Datenmodell (Kurzfassung)

| Bereich | Tabellen |
|---|---|
| Stammdaten | `companies` (+ `company_locations`), `contacts` |
| Recht | `email_permissions` (Rechtsgrundlage je Adresse), `permission_events` (Protokoll), `suppressions` (Sperrliste) |
| E-Mail | `mailboxes` (verschlüsselte Zugangsdaten), `email_messages` (ein- und ausgehend, Thread, KI-Analyse), `email_events` |
| Kampagnen | `campaigns`, `campaign_steps`, `campaign_recipients` |
| Vertrieb | `deals`, `tasks`, `appointments`, `offers`, `contracts`, `activities` (Zeitleiste) |
| System | `automations`, `automation_runs`, `notifications`, `app_settings`, `audit_log` |
