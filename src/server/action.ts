import "server-only";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Einheitliche Fehlerbehandlung für Server Actions (deutschsprachige, sichere Fehlermeldungen). */
export async function run<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (err) {
    // redirect()/notFound() durchreichen
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && /NEXT_(REDIRECT|NOT_FOUND)/.test((err as { digest: string }).digest)) throw err;
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) fieldErrors[issue.path.join(".")] = issue.message;
      return { ok: false, error: err.issues[0]?.message ?? "Ungültige Eingabe", fieldErrors };
    }
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error("Server Action fehlgeschlagen", { err });
    // Datenbankfehler nicht im Detail an den Client geben
    if (/violates|duplicate key|syntax error|relation .* does not exist/i.test(message)) return { ok: false, error: "Die Daten konnten nicht gespeichert werden (Konflikt oder ungültiger Wert)." };
    return { ok: false, error: message };
  }
}

export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
