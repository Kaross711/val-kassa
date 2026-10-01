// app/kassa/page.tsx
import { cookies } from "next/headers";
import { SESSIE_COOKIE, leesSessieCookie } from "@/lib/auth";
import KassaScherm from "./KassaScherm";

export default async function KassaPage() {
    const cookieStore = await cookies();
    const rol = await leesSessieCookie(cookieStore.get(SESSIE_COOKIE)?.value);

    // Een medewerker rekent alleen winkelverkopen af; bestellingen en
    // bedrijfsverkopen doet de beheerder.
    return <KassaScherm alleenWinkel={rol !== "admin"} />;
}
