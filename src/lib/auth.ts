// lib/auth.ts
//
// Inloggen met twee wachtwoorden: het bestaande SITE_PASSWORD geeft een
// beheerder toegang tot alles, WERKNEMER_WW geeft een medewerker alleen
// toegang tot de kassa.
//
// De rol staat in een ondertekend cookie. Zonder handtekening zou een
// medewerker in de browser gewoon een cookie "rol=admin" kunnen zetten en
// alsnog bij de inkoop- en verkoopcijfers komen.

export type Rol = "admin" | "medewerker";

export const SESSIE_COOKIE = "sessie";

// Even lang geldig als het oude auth-cookie: 30 dagen.
export const SESSIE_GELDIGHEID_SECONDEN = 60 * 60 * 24 * 30;

/** Pagina's en routes die alleen de beheerder mag zien. */
const ALLEEN_BEHEERDER = ["/inkoop", "/verkoop", "/kosten", "/api/ocr"];

/** Routes die zonder inloggen bereikbaar moeten blijven. */
const OPENBAAR = ["/login", "/api/login", "/api/logout"];

export function isOpenbaarPad(pad: string): boolean {
    return OPENBAAR.includes(pad);
}

export function magPad(rol: Rol, pad: string): boolean {
    if (rol === "admin") return true;
    return !ALLEEN_BEHEERDER.some((p) => pad === p || pad.startsWith(p + "/"));
}

/**
 * Sleutel om het sessiecookie mee te ondertekenen. Standaard afgeleid van de
 * wachtwoorden zelf, zodat er geen extra omgevingsvariabele nodig is. Zet
 * eventueel AUTH_SECRET als je sessies wilt laten doorlopen wanneer een
 * wachtwoord verandert.
 */
function geheimeSleutel(): string | null {
    const eigen = process.env.AUTH_SECRET;
    if (eigen) return eigen;

    const beheerder = process.env.SITE_PASSWORD;
    if (!beheerder) return null;

    return `${beheerder}::${process.env.WERKNEMER_WW ?? ""}`;
}

const encoder = new TextEncoder();

async function onderteken(inhoud: string, sleutel: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(sleutel),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const handtekening = await crypto.subtle.sign("HMAC", key, encoder.encode(inhoud));

    let binair = "";
    for (const byte of new Uint8Array(handtekening)) {
        binair += String.fromCharCode(byte);
    }
    return btoa(binair).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Vergelijkt twee strings zonder dat de looptijd iets over de inhoud verraadt. */
function gelijk(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let verschil = 0;
    for (let i = 0; i < a.length; i++) {
        verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return verschil === 0;
}

/** Bouwt de cookiewaarde: rol.vervaltijd.handtekening */
export async function maakSessieCookie(rol: Rol): Promise<string | null> {
    const sleutel = geheimeSleutel();
    if (!sleutel) return null;

    const verlooptOp = Date.now() + SESSIE_GELDIGHEID_SECONDEN * 1000;
    const inhoud = `${rol}.${verlooptOp}`;
    return `${inhoud}.${await onderteken(inhoud, sleutel)}`;
}

/** Leest de rol uit het cookie, of null als het ontbreekt, vervallen of vervalst is. */
export async function leesSessieCookie(waarde: string | undefined): Promise<Rol | null> {
    if (!waarde) return null;

    const sleutel = geheimeSleutel();
    if (!sleutel) return null;

    const delen = waarde.split(".");
    if (delen.length !== 3) return null;

    const [rol, verlooptOp, handtekening] = delen;
    if (rol !== "admin" && rol !== "medewerker") return null;

    const vervalt = Number(verlooptOp);
    if (!Number.isFinite(vervalt) || vervalt < Date.now()) return null;

    const verwacht = await onderteken(`${rol}.${verlooptOp}`, sleutel);
    if (!gelijk(verwacht, handtekening)) return null;

    return rol;
}

/** Bepaalt bij welk wachtwoord welke rol hoort. */
export function rolBijWachtwoord(wachtwoord: string): Rol | null {
    const beheerder = process.env.SITE_PASSWORD;
    const medewerker = process.env.WERKNEMER_WW;

    if (beheerder && wachtwoord === beheerder) return "admin";
    if (medewerker && wachtwoord === medewerker) return "medewerker";
    return null;
}

/** Waar iemand na het inloggen terechtkomt. */
export function startPagina(rol: Rol): string {
    return rol === "admin" ? "/" : "/kassa";
}
