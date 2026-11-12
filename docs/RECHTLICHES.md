# Rechtliche Umsetzung (UWG / DSGVO)

> Kein Rechtsrat. Die Software setzt eine vorsichtige Auslegung technisch um. Lassen Sie Ihre Prozesse, Einwilligungstexte und Vorlagen anwaltlich prüfen.

## Grundsatz

Werbung per E-Mail braucht in Deutschland auch gegenüber Unternehmen eine **vorherige ausdrückliche Einwilligung** (§ 7 Abs. 2 Nr. 2 UWG). Ausgenommen sind Bestandskunden unter den Voraussetzungen des § 7 Abs. 3 UWG. Eine öffentlich auffindbare Geschäftsadresse reicht **nicht**.

## Umsetzung in der Software

| Anforderung | Umsetzung |
|---|---|
| Status ≠ Erlaubnis | Vertriebsstatus (`contacts.status`) und Rechtsgrundlage (`email_permissions.basis`) sind getrennte Felder. |
| Nachweis | Eine ausdrückliche Einwilligung braucht Datum und Nachweistext, Bestandskunde eine Dokumentation, Double-Opt-in die Bestätigung. Jede Änderung wird mit Nutzer und Zeitpunkt in `permission_events` protokolliert. |
| Prüfung | Beim Hinzufügen zur Kampagne werden nicht berechtigte Kontakte übersprungen, mit Begründung. Vor **jedem** Versand prüft der Worker erneut. |
| Widerspruch | Kanäle: Abmeldelink (bestätigt; One-Click nach RFC 8058 mit `List-Unsubscribe`), Antwort-E-Mail (KI oder regelbasiert erkannt), Brevo-Abmeldung bzw. -Beschwerde, manuelle Sperre. Jeder Widerspruch sperrt die Adresse dauerhaft und stoppt laufende Sequenzen. |
| Bounces | Hard Bounces (SMTP 5xx, DSN 5.x.x, Brevo hard_bounce/blocked) setzen die Adresse auf die Sperrliste. |
| Pflichtangaben | Ohne vollständiges Impressum ist kein Kampagnenversand möglich. Jede E-Mail erhält Impressum bzw. Pflichtangaben, Werbe-E-Mails zusätzlich den Abmeldelink. |
| Einzelkorrespondenz | Neue E-Mails außerhalb von Kampagnen nur nach Bestätigung „keine Werbung“. An gesperrte Adressen gehen nur Antworten auf deren eigene Nachrichten. |
| Import | Einwilligungen aus CSV werden nur mit Datum **und** Nachweis übernommen. |
| Firmendaten | Recherche ausschließlich über offene Daten (OSM, ODbL, mit Namensnennung), eigene oder lizenzierte Listen. Kein Scraping. |
| DSGVO | Datensparsamkeit (nur geschäftliche Kontaktdaten), CSV-Export für Auskunft, Löschung von Kontakten; Einwilligungs- und Widerspruchsnachweise bleiben aus Nachweisgründen erhalten. Hosting in der EU (Supabase Frankfurt), AVV mit Hosting-, E-Mail-, KI- und Brevo-Anbietern abschließen. |

## Empfohlene Wege zur Einwilligung

- Kontaktformular auf Ihrer Website mit separater, nicht vorausgewählter Checkbox für Informationen per E-Mail, idealerweise mit Double-Opt-in im Newsletter-System und Import per CSV mit Nachweis.
- Persönlicher Kontakt (Messe, Verkostung, Event, auf dem Lieferschein/der Rechnung) mit dokumentierter Einwilligung.
- Bestellformular / Angebotsanfrage auf Ihrer Website mit separater Checkbox für Angebote per E-Mail.
- Bestandskunden: Hinweis auf das Widerspruchsrecht bei Vertragsschluss und in jeder E-Mail.

Für die Erstansprache ohne Einwilligung bleiben persönliche Kanäle wie Telefon (nur bei mutmaßlicher Einwilligung, § 7 Abs. 2 Nr. 1 UWG), Brief oder Besuch. Für diese Fälle gibt es Aufgaben, Termine und Notizen.

## Hinweis für Sushiko (Catering)

Ihre wertvollste rechtssichere Zielgruppe sind **Bestandskunden**: Wer bei Ihnen schon bestellt hat, darf nach § 7 Abs. 3 UWG per E-Mail auf *ähnliche eigene Leistungen* hingewiesen werden (z. B. Weihnachtsfeier-Angebot nach einem Sommerfest-Catering). Das gilt nur, wenn
- die Adresse im Zusammenhang mit der Bestellung erhoben wurde,
- der Kunde schon bei der Erhebung klar auf sein Widerspruchsrecht hingewiesen wurde (z. B. auf Bestellbestätigung oder Rechnung) und nicht widersprochen hat und
- jede E-Mail einen Hinweis zur Abmeldung enthält (macht die Software automatisch).

In der Software: beim Ansprechpartner „Bestandskunde (§ 7 Abs. 3 UWG)“ wählen und im Nachweis Bestelldatum und Ort des Widerspruchshinweises eintragen.
