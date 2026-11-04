/**
 * Legt einen Benutzer für den lokalen Auth-Modus an.
 * Aufruf: npm run user:create -- <email> "<Name>" <passwort> [admin|member]
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { closeDb, db, schema } from "@/db";

async function main() {
  const [email, fullName, password, role = "admin"] = process.argv.slice(2);
  if (!email || !fullName || !password || password.length < 10) {
    console.error('Aufruf: npm run user:create -- <email> "<Name>" <passwort (min. 10 Zeichen)> [admin|member]');
    process.exit(1);
  }
  await db
    .insert(schema.profiles)
    .values({ email: email.toLowerCase(), fullName, role: role === "member" ? "member" : "admin", passwordHash: await bcrypt.hash(password, 12) })
    .onConflictDoUpdate({ target: schema.profiles.email, set: { fullName, passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`Benutzer ${email} gespeichert.`);
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
