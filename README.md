# Sushiko CRM – B2B-Akquise für Sushi-Catering (Hamburg)

Interne Vertriebsplattform für Sushiko Hamburg: Firmenkunden finden (Agenturen, Kanzleien, Tech-Firmen, Coworking-Spaces, Eventlocations, Hotels …), Kontakte pflegen, rechtssichere E-Mail-Kampagnen, IMAP/SMTP-Postfach, KI-Antwortanalyse, Pipeline, Catering-Angebote für Events und Lunch-Abos, Automatisierungen und Kennzahlen.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui-Komponenten (Radix) · Recharts · PostgreSQL/Supabase · Drizzle ORM · pg-boss (Job-Queue) · ImapFlow/Nodemailer · Anthropic/OpenAI · Zod · Vitest

## Funktionsumfang

| Bereich | Inhalt |
|---|---|
| Dashboard | 15 KPIs (u. a. Event-Umsatz, Abo-Umsatz, gewonnene Aufträge) und 6 Diagramme, alle aus gespeicherten Daten. Filter nach Zeitraum, Branche, Kampagne, Mitarbeiter und Status. Checkliste für die Einrichtung. |
| Firmenfinder | OpenStreetMap/Overpass (ODbL) nach Branche, Stadtteil (Auswahl nach Bezirken), PLZ und Name. Erkennt vorhandene Datensätze. Dazu CSV-Import und manuelle Erfassung. Ohne Datenquelle steht in der Oberfläche „Nicht verbunden“; es werden keine Beispieltreffer gezeigt. |
| Unternehmen | Zielbranchen für Catering (Agenturen, Kanzleien, Tech, Coworking, Eventlocations, Hotels, Büros …). Liste mit Volltextsuche (deutsch), Filtern, Sortierung und Sammelaktionen (Status, Zuständigkeit, Tags, Export, Löschen). Duplikaterkennung und Zusammenführen. Detailseite mit Zeitleiste, Kommunikation, Aufgaben, Terminen, Angeboten, Verträgen, mehreren Standorten, Wiedervorlage und Potenzial-Score nach Branche, Mitarbeitenden, typischer Gästezahl und Entscheider (nachvollziehbar, manuell überschreibbar). |
| Ansprechpartner | Mehrere pro Firma. **Vertriebsstatus und Werbeerlaubnis sind getrennte Felder.** Die Erlaubnis wird mit Nachweis gepflegt; jede Änderung landet im Protokoll. |
| Kampagnen | Sequenzen mit bis zu 6 Schritten, Platzhaltern und Vorschau, optional KI-Personalisierung. Versandfenster (Europe/Berlin), Tageslimits und Mindestabstand. Stopp bei Antwort. Versand über SMTP oder Brevo. |
| Postfach | IMAP-Abruf alle 2 Minuten mit Zuordnung zu Thread, Kontakt und Firma. Erkennt Bounces (DSN, RFC 3464) und Abwesenheitsnotizen. KI-Analyse, KI-Antwortentwurf, manuelle Zuordnung. |
| Pipeline | Kanban mit Drag & Drop, gewichteter Pipeline-Wert und Grund bei verlorenen Deals. |
| Aufgaben & Termine | Wiedervorlagen, Rückrufe, Verkostungen und Event-Lieferungen; Ansichten heute fällig und überfällig. |
| Angebote & Aufträge | Catering-Angebote mit Eventdatum, Personenzahl, Lieferadresse, Allergene/Ernährungshinweisen, Positionen pro Event oder als monatliches Abo, Preis pro Person, USt.-Standard 7 % (Lieferung ohne Service). Druckbar als PDF. Bei „Angenommen“: Deal gewonnen, Liefertermin im Kalender, Abo-Positionen werden zum Rahmenvertrag. |
| Automatisierungen | Wenn-Dann-Regeln mit 7 Auslösern und 6 Aktionen. Jede Regel läuft pro Ereignis genau einmal; Ausführungsprotokoll. |
| Analytics | Quoten, Funnel, Antwortkategorien, Vergleich nach Branche, Kampagne und Mitarbeiter. |
| Einstellungen | Impressum/Absender, Postfach mit Verbindungstest, Integrationen, Team, Profil/Signatur, Sperrliste, Vertrieb, Systemstatus. |

## Schnellstart (lokal)

Voraussetzungen: Node.js ≥ 20.9 und PostgreSQL ≥ 15 (lokal oder Supabase).

```bash
npm install
```

```bash
cp .env.example .env
```

In `.env` mindestens `DATABASE_URL`, `APP_ENCRYPTION_KEY` und `AUTH_SECRET` setzen. Für die lokale Entwicklung zusätzlich `AUTH_PROVIDER=local` und `APP_URL=http://localhost:3000`.

```bash
npm run db:migrate
```

```bash
npm run dev
```

Den Worker in einem zweiten Terminal starten (Versand, Postfach-Abruf, KI, Automatisierungen):

```bash
npm run worker
```

Beim ersten Aufruf von http://localhost:3000 legen Sie das Administratorkonto an (nur bei `AUTH_PROVIDER=local`). Danach unter **Einstellungen**:

1. Unternehmen/Impressum ausfüllen
2. E-Mail-Postfach verbinden
3. Integrationen prüfen

Optional: fiktive, als „Demo“ markierte Testdaten (nur für die Entwicklung, in Produktion gesperrt):

```bash
npm run db:seed:demo
```

```bash
npm run db:seed:demo -- --remove
```

## Tests

```bash
npm test
```

- **Unit-Tests:** Rechtsprüfung, Templates, DSN-/Bounce-Erkennung, Abmelde-Erkennung, CSV-Parser, Overpass-Abfragen, Scoring, Verschlüsselung, Versandfenster inkl. Sommerzeit.
- **Integrationstest:** gegen eine echte PostgreSQL-Testdatenbank (`TEST_DATABASE_URL`, Standard `crm_test`) und einen lokalen SMTP-Server über TLS. Abgedeckt ist der ganze Ablauf: Kampagne → Empfängerprüfung → Versand → SMTP-Ablehnung (Hard Bounce) → Idempotenz → Antwortzuordnung → Automatisierung → Abmeldung per E-Mail → DSN-Bounce → Abmeldelink → Brevo-Webhook → Kennzahlen.

Weitere Prüfungen:

```bash
npm run typecheck
```

```bash
npm run lint
```

## Betrieb

Siehe [docs/BETRIEB.md](docs/BETRIEB.md) (Supabase EU, Docker, Postfach, Brevo, KI). Architekturentscheidungen stehen in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), die rechtliche Umsetzung in [docs/RECHTLICHES.md](docs/RECHTLICHES.md).
