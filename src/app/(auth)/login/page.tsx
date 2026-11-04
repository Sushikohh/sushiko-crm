import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const needsSetup = env.AUTH_PROVIDER === "local" && !(await hasAnyUser());
  if (needsSetup) redirect("/setup");
  const { next } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
        <p className="text-sm text-muted-foreground">Melden Sie sich mit Ihrem Firmenkonto an.</p>
      </div>
      <LoginForm next={next ?? ""} />
      <p className="text-center text-xs text-muted-foreground">
        Zugang über {env.AUTH_PROVIDER === "supabase" ? "Supabase Auth" : "lokale Benutzerverwaltung"}.{" "}
        <Link className="underline underline-offset-2" href="/datenschutz">
          Datenschutz
        </Link>
      </p>
    </div>
  );
}
