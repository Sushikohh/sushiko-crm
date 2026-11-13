import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/env";

/** Supabase-Client für Server Components / Server Actions (Cookie-basierte Session). */
export async function supabaseServer() {
  const store = await cookies();
  const { url, publishableKey } = supabaseConfig();
  if (!url || !publishableKey) {
    throw new Error("Supabase ist nicht konfiguriert (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).");
  }
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // In Server Components nicht erlaubt – der Proxy erneuert die Session.
        }
      },
    },
  });
}
