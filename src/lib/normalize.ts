/** Normalisierung für Duplikaterkennung und Suche. */
const LEGAL_FORMS =
  /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|ug\s*\(haftungsbeschränkt\)|ug|ag|kg|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|mbh|partg(mbb)?|se|ltd\.?|inc\.?|co\.?)(?=\s|$|[^a-z])/g;

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(LEGAL_FORMS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function extractDomain(urlOrEmail: string | null | undefined): string | null {
  if (!urlOrEmail) return null;
  const v = urlOrEmail.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@") && !v.startsWith("http")) return v.split("@")[1] ?? null;
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim();
  if (!v) return null;
  return v.startsWith("http") ? v : `https://${v}`;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const p = phone.replace(/[^\d+]/g, "");
  return p.length >= 6 ? p : null;
}

/** Trigramm-Ähnlichkeit (0–1) für unscharfe Duplikaterkennung. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = `  ${s} `;
    const set = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "t-online.de", "outlook.com", "outlook.de",
  "hotmail.com", "hotmail.de", "yahoo.de", "yahoo.com", "icloud.com", "aol.com", "freenet.de", "posteo.de", "mail.de",
]);
export function isFreemailDomain(domain: string | null | undefined) {
  return !!domain && FREEMAIL.has(domain.toLowerCase());
}
