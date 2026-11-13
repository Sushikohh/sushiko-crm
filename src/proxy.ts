import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Optimistische Zugriffsprüfung + Supabase-Session-Refresh.
 * Die eigentliche Autorisierung erfolgt serverseitig in jeder Seite/Aktion (requireUser).
 */
const PUBLIC_PREFIXES = ["/login", "/setup", "/datenschutz", "/u/", "/api/webhooks/", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  let response = NextResponse.next({ request });
  let hasSession = false;

  // Dynamischer Zugriff: wird zur Laufzeit gelesen und nicht beim Build eingefroren
  const read = (...keys: string[]) => keys.map((k) => process.env[k]).find((v) => !!v) ?? "";
  const sbUrl = read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const sbKey = read("SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (process.env.AUTH_PROVIDER === "supabase" && sbUrl && sbKey) {
    const supabase = createServerClient(sbUrl, sbKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    hasSession = !!data.user;
  } else {
    hasSession = !!request.cookies.get("crm_session")?.value;
  }

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
