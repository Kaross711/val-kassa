// app/verkoop/page.tsx
import { cookies } from "next/headers";
import { SESSIE_COOKIE, leesSessieCookie } from "@/lib/auth";
import VerkoopScherm from "./VerkoopScherm";

export default async function VerkoopPage() {
    const cookieStore = await cookies();
    const rol = await leesSessieCookie(cookieStore.get(SESSIE_COOKIE)?.value);

    // Een medewerker ziet alleen de winkelverkopen; bestellingen, bedrijfsverkopen,
    // inkoop, kosten en winst blijven voor de beheerder.
    return <VerkoopScherm alleenWinkel={rol !== "admin"} />;
}
