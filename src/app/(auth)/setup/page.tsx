import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Ersteinrichtung" };
// Muss bei jeder Anfrage prüfen, ob bereits Benutzer existieren
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (env.AUTH_PROVIDER !== "local" || (await hasAnyUser())) redirect("/login");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Willkommen</h1>
        <p className="text-sm text-muted-foreground">Legen Sie das erste Administratorkonto an. Weitere Mitarbeiter können Sie danach in den Einstellungen einladen.</p>
      </div>
      <SetupForm />
    </div>
  );
}
