import Link from "next/link";

export const metadata = { title: "Datenschutzhinweise" };

/** Interne Datenschutzhinweise für Nutzer der Anwendung (kein Ersatz für die Website-Datenschutzerklärung). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed">
      <Link href="/login" className="text-xs text-muted-foreground hover:underline">
        ← Zurück
      </Link>
      <h1 className="mt-4 mb-4 text-2xl font-semibold">Datenschutzhinweise zur Akquise-Software</h1>
      <p className="mb-3">Diese Anwendung verarbeitet geschäftliche Kontaktdaten von Unternehmen und deren Ansprechpartnern zur Anbahnung und Durchführung von Reinigungsverträgen (Art. 6 Abs. 1 lit. b und f DSGVO).</p>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        <li>Werbe-E-Mails werden ausschließlich an Empfänger mit nachgewiesener Einwilligung bzw. im Rahmen von § 7 Abs. 3 UWG versendet. Jede Werbe-E-Mail enthält einen Abmeldelink.</li>
        <li>Widersprüche und Abmeldungen werden sofort umgesetzt und dauerhaft auf einer Sperrliste dokumentiert.</li>
        <li>Unternehmensdaten aus OpenStreetMap stehen unter der Open Database License (© OpenStreetMap-Mitwirkende).</li>
        <li>Bei aktivierter KI-Analyse werden Inhalte eingehender Antworten an den konfigurierten KI-Anbieter übermittelt (Auftragsverarbeitung).</li>
        <li>Postfach-Zugangsdaten werden verschlüsselt (AES-256-GCM) gespeichert.</li>
      </ul>
      <p>Auskunft, Berichtigung und Löschung: Wenden Sie sich an den Verantwortlichen laut Impressum des Unternehmens.</p>
    </main>
  );
}
