import { Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2 font-medium">
          <div className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <Sparkles className="size-4" />
          </div>
          Akquise-CRM
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--brand)_35%,transparent),transparent_55%),radial-gradient(circle_at_80%_80%,color-mix(in_oklch,var(--chart-2)_25%,transparent),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md text-2xl font-semibold tracking-tight">Neue Reinigungsverträge in Hamburg – strukturiert, rechtssicher und messbar gewinnen.</p>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">Firmenrecherche, Kontaktverwaltung, Kampagnen mit Einwilligungsprüfung, KI-Antwortanalyse, Pipeline und Kennzahlen an einem Ort.</p>
        </div>
      </div>
    </div>
  );
}
