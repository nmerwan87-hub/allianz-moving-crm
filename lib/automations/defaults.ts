/**
 * Built-in texts of the automatic e-mails. A company can replace the German
 * text in Einstellungen → E-Mail-Automatik (stored as a template version);
 * other languages use these texts until edited.
 *
 * Placeholders: {kunde} {firma} {offerte} {gueltig_bis} {betrag} {umzugsdatum}
 * {startzeit} {von} {nach} {rechnung} — and {link} for the customer portal,
 * which also appears as a button.
 */

export const AUTOMATION_SLUGS = [
  "quote-follow-up-1",
  "quote-expiry-warning",
  "booking-confirmed",
  "move-reminder",
  "post-move-thank-you",
  "payment-confirmed",
] as const

export type AutomationSlug = (typeof AUTOMATION_SLUGS)[number]

/**
 * Name, description and default timing (seconds; negative = before the move
 * or the quote expiry). Also applied by migration 036 to existing companies.
 */
export const AUTOMATION_META: Record<
  AutomationSlug,
  { name: string; description: string; delaySeconds: number }
> = {
  "quote-follow-up-1": {
    name: "Offerte nachfassen",
    description: "Freundliche Nachfrage, wenn der Kunde noch nicht geantwortet hat.",
    delaySeconds: 3 * 86_400,
  },
  "quote-expiry-warning": {
    name: "Offerte läuft bald ab",
    description: "Hinweis kurz bevor die Offerte abläuft.",
    delaySeconds: -2 * 86_400,
  },
  "booking-confirmed": {
    name: "Buchungsbestätigung",
    description: "Bestätigung, sobald die Offerte angenommen ist.",
    delaySeconds: 0,
  },
  "move-reminder": {
    name: "Erinnerung vor dem Umzug",
    description: "Erinnerung mit Datum, Zeit und Adressen vor dem Umzugstag.",
    delaySeconds: -2 * 86_400,
  },
  "post-move-thank-you": {
    name: "Dankeschön nach dem Umzug",
    description: "Dank nach dem erledigten Auftrag.",
    delaySeconds: 86_400,
  },
  "payment-confirmed": {
    name: "Zahlung erhalten",
    description: "Bestätigung, wenn die Rechnung vollständig bezahlt ist.",
    delaySeconds: 0,
  },
}
export type AutomationLanguage = "de" | "fr" | "it" | "en"

export interface AutomationText {
  subject: string
  body: string
  /** Label of the button to {link}; no button when null */
  action: string | null
}

export const PLACEHOLDERS: Record<AutomationSlug, string[]> = {
  "quote-follow-up-1": ["kunde", "firma", "offerte", "gueltig_bis", "betrag", "link"],
  "quote-expiry-warning": ["kunde", "firma", "offerte", "gueltig_bis", "betrag", "link"],
  "booking-confirmed": ["kunde", "firma", "offerte", "umzugsdatum", "von", "nach", "link"],
  "move-reminder": ["kunde", "firma", "umzugsdatum", "startzeit", "von", "nach"],
  "post-move-thank-you": ["kunde", "firma", "umzugsdatum"],
  "payment-confirmed": ["kunde", "firma", "rechnung", "betrag"],
}

export const DEFAULT_TEXTS: Record<AutomationSlug, Record<AutomationLanguage, AutomationText>> = {
  "quote-follow-up-1": {
    de: {
      subject: "Ihre Offerte {offerte} — haben Sie noch Fragen?",
      body: "Vor ein paar Tagen haben wir Ihnen unsere Offerte für Ihren Umzug geschickt. Haben Sie noch Fragen oder Wünsche? Wir passen die Offerte gerne an.\n\nSie können die Offerte bis {gueltig_bis} direkt online annehmen.",
      action: "Offerte ansehen",
    },
    fr: {
      subject: "Votre offre {offerte} — avez-vous des questions ?",
      body: "Il y a quelques jours, nous vous avons envoyé notre offre pour votre déménagement. Avez-vous des questions ou des souhaits ? Nous adaptons volontiers l'offre.\n\nVous pouvez accepter l'offre en ligne jusqu'au {gueltig_bis}.",
      action: "Voir l'offre",
    },
    it: {
      subject: "La vostra offerta {offerte} — avete domande?",
      body: "Qualche giorno fa vi abbiamo inviato la nostra offerta per il vostro trasloco. Avete domande o desideri? Adattiamo volentieri l'offerta.\n\nPotete accettare l'offerta online fino al {gueltig_bis}.",
      action: "Vedere l'offerta",
    },
    en: {
      subject: "Your quote {offerte} — any questions?",
      body: "A few days ago we sent you our quote for your move. Do you have any questions or wishes? We are happy to adjust the quote.\n\nYou can accept the quote online until {gueltig_bis}.",
      action: "View the quote",
    },
  },
  "quote-expiry-warning": {
    de: {
      subject: "Ihre Offerte {offerte} ist noch bis {gueltig_bis} gültig",
      body: "Ihre Offerte über {betrag} ist noch bis {gueltig_bis} gültig. Damit wir Ihr Wunschdatum reservieren können, nehmen Sie die Offerte am einfachsten direkt online an.",
      action: "Offerte ansehen und annehmen",
    },
    fr: {
      subject: "Votre offre {offerte} est valable jusqu'au {gueltig_bis}",
      body: "Votre offre de {betrag} est encore valable jusqu'au {gueltig_bis}. Pour que nous puissions réserver la date souhaitée, acceptez simplement l'offre en ligne.",
      action: "Voir et accepter l'offre",
    },
    it: {
      subject: "La vostra offerta {offerte} è valida fino al {gueltig_bis}",
      body: "La vostra offerta di {betrag} è ancora valida fino al {gueltig_bis}. Per riservare la data desiderata, accettate semplicemente l'offerta online.",
      action: "Vedere e accettare l'offerta",
    },
    en: {
      subject: "Your quote {offerte} is valid until {gueltig_bis}",
      body: "Your quote of {betrag} is still valid until {gueltig_bis}. To reserve your preferred date, simply accept the quote online.",
      action: "View and accept the quote",
    },
  },
  "booking-confirmed": {
    de: {
      subject: "Buchungsbestätigung: Ihr Umzug am {umzugsdatum}",
      body: "Vielen Dank für Ihren Auftrag! Wir bestätigen Ihren Umzug am {umzugsdatum} von {von} nach {nach}.\n\nWir melden uns vor dem Umzugstag mit allen Details. Bei Fragen sind wir jederzeit für Sie da.",
      action: "Offerte ansehen",
    },
    fr: {
      subject: "Confirmation de réservation : votre déménagement le {umzugsdatum}",
      body: "Merci pour votre mandat ! Nous confirmons votre déménagement le {umzugsdatum} de {von} à {nach}.\n\nNous vous contacterons avant le jour du déménagement avec tous les détails.",
      action: "Voir l'offre",
    },
    it: {
      subject: "Conferma di prenotazione: il vostro trasloco il {umzugsdatum}",
      body: "Grazie per il vostro incarico! Confermiamo il vostro trasloco il {umzugsdatum} da {von} a {nach}.\n\nVi contatteremo prima del giorno del trasloco con tutti i dettagli.",
      action: "Vedere l'offerta",
    },
    en: {
      subject: "Booking confirmation: your move on {umzugsdatum}",
      body: "Thank you for your order! We confirm your move on {umzugsdatum} from {von} to {nach}.\n\nWe will contact you before moving day with all the details.",
      action: "View the quote",
    },
  },
  "move-reminder": {
    de: {
      subject: "Bald ist Umzugstag: {umzugsdatum}",
      body: "Ihr Umzug steht bevor: am {umzugsdatum} um {startzeit} Uhr starten wir an der {von}. Ziel: {nach}.\n\nBitte sorgen Sie dafür, dass Zugang und Parkplatz frei sind, und packen Sie Wertsachen und wichtige Dokumente separat ein.",
      action: null,
    },
    fr: {
      subject: "Bientôt le jour du déménagement : {umzugsdatum}",
      body: "Votre déménagement approche : le {umzugsdatum} à {startzeit} heures, nous commençons à {von}. Destination : {nach}.\n\nVeuillez vous assurer que l'accès et la place de parc sont libres et emballez vos objets de valeur séparément.",
      action: null,
    },
    it: {
      subject: "Presto è il giorno del trasloco: {umzugsdatum}",
      body: "Il vostro trasloco si avvicina: il {umzugsdatum} alle {startzeit} iniziamo in {von}. Destinazione: {nach}.\n\nAssicuratevi che l'accesso e il parcheggio siano liberi e imballate separatamente gli oggetti di valore.",
      action: null,
    },
    en: {
      subject: "Moving day is coming: {umzugsdatum}",
      body: "Your move is coming up: on {umzugsdatum} at {startzeit} we start at {von}. Destination: {nach}.\n\nPlease make sure access and parking are free, and pack valuables and important documents separately.",
      action: null,
    },
  },
  "post-move-thank-you": {
    de: {
      subject: "Danke für Ihr Vertrauen",
      body: "Ihr Umzug vom {umzugsdatum} ist erledigt — vielen Dank, dass Sie uns gewählt haben! Wir hoffen, Sie haben sich im neuen Zuhause gut eingelebt.\n\nÜber eine Weiterempfehlung freuen wir uns sehr.",
      action: null,
    },
    fr: {
      subject: "Merci pour votre confiance",
      body: "Votre déménagement du {umzugsdatum} est terminé — merci de nous avoir choisis ! Nous espérons que vous vous sentez bien dans votre nouveau chez-vous.\n\nUne recommandation nous ferait très plaisir.",
      action: null,
    },
    it: {
      subject: "Grazie per la vostra fiducia",
      body: "Il vostro trasloco del {umzugsdatum} è concluso — grazie per averci scelto! Speriamo che vi troviate bene nella nuova casa.\n\nUna raccomandazione ci farebbe molto piacere.",
      action: null,
    },
    en: {
      subject: "Thank you for your trust",
      body: "Your move on {umzugsdatum} is done — thank you for choosing us! We hope you have settled in well in your new home.\n\nWe would be delighted if you recommended us.",
      action: null,
    },
  },
  "payment-confirmed": {
    de: {
      subject: "Zahlung erhalten: Rechnung {rechnung}",
      body: "Wir haben Ihre Zahlung für die Rechnung {rechnung} erhalten. Herzlichen Dank!",
      action: null,
    },
    fr: {
      subject: "Paiement reçu : facture {rechnung}",
      body: "Nous avons bien reçu votre paiement pour la facture {rechnung}. Merci beaucoup !",
      action: null,
    },
    it: {
      subject: "Pagamento ricevuto: fattura {rechnung}",
      body: "Abbiamo ricevuto il vostro pagamento per la fattura {rechnung}. Grazie mille!",
      action: null,
    },
    en: {
      subject: "Payment received: invoice {rechnung}",
      body: "We have received your payment for invoice {rechnung}. Thank you very much!",
      action: null,
    },
  },
}

/** Replaces {name} placeholders; unknown ones stay visible so mistakes are noticed. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => values[key] ?? match)
}
