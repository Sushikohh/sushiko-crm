/**
 * Unternehmensdaten von SUSHIKO, übernommen von der eigenen Website (Stand 13.11.2026):
 * - www.sushiko-hh.de/impressum.html, /agb.html, /liefergebiet.html, /speisekarte/
 * - catering.sushiko-hh.de
 *
 * Diese Werte dienen als Vorbelegung. Verbindlich sind die in den Einstellungen gespeicherten Daten.
 * Catering-Preise stehen nicht auf der Website („Jedes Catering stellen wir einzeln zusammen“) –
 * deshalb gibt es hier bewusst keinen Buffet-Preis. Er wird in Einstellungen → Katalog gepflegt.
 */

export const SOURCE_NOTE = "Quelle: sushiko-hh.de, Stand 13.11.2026";

/** Impressum (Absenderangaben). Rechtsform laut Inhaber: GbR. */
export const SUSHIKO_IDENTITY = {
  companyName: "SUSHIKO",
  legalForm: "GbR",
  street: "Klaus-Groth-Straße 59",
  postalCode: "20535",
  city: "Hamburg",
  phone: "040 311 71 631",
  email: "info@sushiko-hh.de",
  website: "www.sushiko-hh.de",
  // Impressum nennt „Inhaber: Wida Gurbanian“. Bei einer GbR sind alle Gesellschafter anzugeben.
  managingDirector: "Wida Gurbanian",
  registerInfo: "",
  vatId: "",
  taxNumber: "46/661/04825",
};

/** Catering-Kontakt laut catering.sushiko-hh.de */
export const SUSHIKO_CATERING_CONTACT = {
  email: "catering@sushiko-hh.de",
  phone: "0179 594 64 61",
  whatsapp: "0179 594 64 61",
  website: "catering.sushiko-hh.de",
};

export const DEFAULT_SIGNATURE = `Mit freundlichen Grüßen

SUSHIKO Catering
Tel. & WhatsApp ${SUSHIKO_CATERING_CONTACT.phone}
${SUSHIKO_CATERING_CONTACT.email}
${SUSHIKO_CATERING_CONTACT.website}`;

/** Rahmenbedingungen laut Catering-Website. */
export const CATERING_FACTS = {
  minGuests: { event: 25, officeLunch: 15, wedding: 40 },
  leadTime: "bis 30 Gäste 48 Stunden, bis 80 Gäste 3 Werktage, darüber 5 Werktage",
  offerWithin: "24 Stunden",
  included: ["Frische Zubereitung am Liefertag", "Anlieferung in Hamburg", "Buffet-Aufbau vor Ort", "Allergen-Beschilderung", "Sojasauce, Wasabi, Ingwer", "Stäbchen und Servietten", "Servierplatten"],
  notIncluded: ["Geschirr, Gläser, Besteck", "Tische, Mobiliar, Dekoration", "Servicepersonal während der Feier", "Abbau nach dem Event", "Getränke"],
  area: "Hamburg vollständig; Umland (z. B. Norderstedt, Pinneberg) auf Anfrage ab 40 Gästen mit Anfahrtspauschale",
  christmas: "Weihnachtsfeiern: Lieferung bis zum 20. Dezember in ganz Hamburg",
};

/** Faustregel „Stück pro Gast“ laut Catering-FAQ. */
export const PIECES_PER_GUEST = {
  side: { label: "Sushi als Teil eines größeren Buffets", min: 8, max: 10 },
  main: { label: "Sushi als Hauptkomponente (Firmenfeier)", min: 10, max: 13 },
  full: { label: "Reiner Sushi-Abend / Hochzeit", min: 13, max: 16 },
} as const;
export type PortionKey = keyof typeof PIECES_PER_GUEST;

export const DEFAULT_OFFER_INTRO = "vielen Dank für Ihre Anfrage. Gern unterbreiten wir Ihnen folgendes Angebot für Ihr Sushi-Catering – am Tag der Veranstaltung frisch zubereitet, von uns geliefert und vor Ort als Buffet aufgebaut.";

export const DEFAULT_OFFER_TERMS = `Alle Preise verstehen sich netto zzgl. gesetzlicher Umsatzsteuer.
Im Preis enthalten: ${CATERING_FACTS.included.join(", ")}.
Nicht enthalten: ${CATERING_FACTS.notIncluded.join(", ")}.
Vorlauf: ${CATERING_FACTS.leadTime}. Die vegetarischen und veganen Anteile sowie Allergien stimmen wir vorab mit Ihnen ab.
Liefergebiet: ${CATERING_FACTS.area}.
Es gelten unsere AGB (www.sushiko-hh.de/agb.html). Dieses Angebot ist bis zum angegebenen Datum gültig.`;

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  pieces: number | null;
  /** Listenpreis brutto inkl. 7 % USt. (Lieferpreis laut Speisekarte, ohne Online-Rabatt) */
  priceGross: number | null;
  allergens: string;
  category: "menu" | "buffet" | "extra";
  source: string;
};

const SK = "Speisekarte sushiko-hh.de, Stand 13.11.2026";

/** Sushi-Menüs der Speisekarte (regulärer Preis ohne 10 % Online-Rabatt). Geeignet für Office Lunch. */
export const DEFAULT_CATALOG: CatalogItem[] = [
  { id: "special-menue", name: "Sushiko Special Menü", pieces: 70, priceGross: 103.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Soja, Milch, Ei, Sesam", description: "8 Sushiko Special Roll, 8 Inside Out Creamy Lachs, 8 Inside Out Crispy Chicken, 8 Inside Out Red Tuna, 8 Dragon Roll, 4 Kappa Maki, 4 Avocado Maki, 8 Sashimi Mix, 6 Rocket Lachs, 4 Lachs Nigiri, 4 Tuna Nigiri" },
  { id: "sharing-platte", name: "Sushiko Sharing Platte", pieces: null, priceGross: 72.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Milch, Weizen, Sesam", description: "8 Lachs Maki, 8 Green Tuna Maki, 8 Inside Out Classic, 8 Inside Out Sweet Roasted, 2 Lachs Nigiri, 2 Tuna Nigiri, Lachs- und Tuna-Sashimi" },
  { id: "deluxe-mix", name: "Deluxe Mix", pieces: 39, priceGross: 68.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Milch, Weizen, Sesam", description: "8 Inside Out California Lachs, 8 Inside Out Crispy Chicken, 8 Maki Tuna Avocado, 8 Maki Ebi, je 1 Nigiri Lachs, Thunfisch und Garnele, 6 Rocket Lachs" },
  { id: "california-dream", name: "California Dream", pieces: 32, priceGross: 42.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Milch, Soja, Weizen, Sesam", description: "Je 8 Inside Out Creamy Lachs mit Avocado, Classic, Red Tuna und Ebi Tempura" },
  { id: "crunchy-mix", name: "Crunchy Roll Mix Menü", pieces: 24, priceGross: 40.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Soja, Milch, Ei, Sesam", description: "8 Tempura Crispy Chicken, 8 Tempura Crispy Lachs, 8 Tempura Tuna" },
  { id: "sushi-mix", name: "Sushi Mix", pieces: 28, priceGross: 36.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Soja, Milch, Ei, Sesam", description: "2 Lachs Nigiri, 2 Thunfisch Nigiri, 8 Maki Green Tuna, 8 Maki Surimi Peanut, 8 Inside Out Vegetarian" },
  { id: "lachs-menue", name: "Lachs Menü", pieces: 22, priceGross: 33.9, category: "menu", source: SK, allergens: "", description: "8 Sake Maki, 8 Inside Out California Lachs, 2 Lachs Nigiri, 4 Lachs Sashimi" },
  { id: "inside-out-mix", name: "Inside Out Mix", pieces: 24, priceGross: 32.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Weizen, Soja, Sesam", description: "Je 8 Inside Out California Lachs, Ebi Tempura Avocado und Crispy Chicken" },
  { id: "veggie-menue", name: "Sushiko Veggie Menü", pieces: 28, priceGross: 29.9, category: "menu", source: SK, allergens: "", description: "8 Kappa Maki, 8 Avocado Maki, 8 Inside Out Veggie Roll, 2 Avocado Nigiri, 2 Gurke Nigiri" },
  { id: "makis-dream", name: "Maki’s Dream", pieces: 24, priceGross: 29.9, category: "menu", source: SK, allergens: "Fisch, Milch, Nüsse", description: "8 Maki Lachs, 8 Maki Tuna Avocado, 8 Maki Cashew Roll" },
  { id: "veggie-mix", name: "Veggie Mix", pieces: 22, priceGross: 27.9, category: "menu", source: SK, allergens: "Erdnüsse, Milch, Gluten", description: "8 Inside Out Peanut Roll, 8 Green Roll, 6 Rocket Green, 2 Avocado Nigiri" },
  { id: "bento-classic", name: "Bento Classic", pieces: 16, priceGross: 19.9, category: "menu", source: SK, allergens: "Fisch, Milch, Sesam", description: "8 Inside Out Creamy Lachs mit Avocado, 8 Maki Green Tuna mit Avocado" },
  { id: "spar-menue", name: "Spar-Menü", pieces: 16, priceGross: 18.9, category: "menu", source: SK, allergens: "Fisch, Krebstiere, Milch, Soja, Sesam", description: "8 Inside Out Classic, 8 Maki Lachs" },
];

/** Netto aus Brutto (Speisenlieferung 7 % USt.), kaufmännisch gerundet. */
export function netFromGross(gross: number, vatRate = 7) {
  return Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
}
