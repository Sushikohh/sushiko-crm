import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { ACQ_STATUS, INDUSTRIES, PERMISSION_BASIS, type PermissionBasisKey } from "@/lib/constants";
import { CSV_TEMPLATE_HEADER } from "@/lib/finder/csv";
import { listContacts } from "@/lib/services/contact-queries";
import { companyWhere } from "@/lib/services/queries";
import { audit } from "@/lib/services/audit";

function csv(rows: Record<string, unknown>[], name: string) {
  // Semikolon + BOM für Excel (deutsch)
  const body = "﻿" + Papa.unparse(rows, { delimiter: ";" });
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { kind } = await params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const ids = sp.ids ? sp.ids.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : null;

  if (kind === "template") {
    return new NextResponse(`﻿${CSV_TEMPLATE_HEADER}\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="import-vorlage.csv"' } });
  }

  if (kind === "companies") {
    const c = schema.companies;
    const rows = await db
      .select({ c, owner: schema.profiles.fullName })
      .from(c)
      .leftJoin(schema.profiles, eq(schema.profiles.id, c.ownerId))
      .where(ids ? and(inArray(c.id, ids)) : companyWhere(sp))
      .limit(50000);
    await audit({ actorId: user.id, action: "export", entity: "companies", details: { count: rows.length } });
    return csv(
      rows.map(({ c: x, owner }) => ({
        Firma: x.name,
        Branche: INDUSTRIES[x.industry],
        Straße: x.street,
        PLZ: x.postalCode,
        Ort: x.city,
        Stadtteil: x.district,
        Website: x.website,
        Telefon: x.phone,
        "E-Mail": x.email,
        Mitarbeiter: x.employeeCount,
        "Fläche m²": x.areaSqm,
        Status: ACQ_STATUS[x.status].label,
        Potenzial: x.potentialScore,
        Zuständig: owner,
        Tags: x.tags.join(", "),
        Quelle: x.source,
        Erfasst: x.capturedAt.toISOString().slice(0, 10),
        Wiedervorlage: x.nextFollowUpAt?.toISOString().slice(0, 10) ?? "",
        Notizen: x.notes,
      })),
      "unternehmen",
    );
  }

  if (kind === "contacts") {
    const { rows } = ids ? await listContacts({}, { all: true }).then((r) => ({ rows: r.rows.filter((x) => ids.includes(x.id)) })) : await listContacts(sp, { all: true });
    await audit({ actorId: user.id, action: "export", entity: "contacts", details: { count: rows.length } });
    return csv(
      rows.map((x) => ({
        Anrede: x.salutation,
        Vorname: x.firstName,
        Nachname: x.lastName,
        Funktion: x.position,
        "E-Mail": x.email,
        Telefon: x.phone,
        Firma: x.companyName,
        Status: ACQ_STATUS[x.status].label,
        Werbeerlaubnis: x.basis ? PERMISSION_BASIS[x.basis as PermissionBasisKey].label : "Keine",
        Versandberechtigt: x.permitted ? "ja" : "nein",
        Gesperrt: x.suppressed ? "ja" : "nein",
        Tags: x.tags.join(", "),
      })),
      "ansprechpartner",
    );
  }
  return NextResponse.json({ error: "Unbekannter Export" }, { status: 404 });
}
