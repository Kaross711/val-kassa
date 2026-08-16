import { NextRequest, NextResponse } from "next/server";
import {
    SESSIE_COOKIE,
    SESSIE_GELDIGHEID_SECONDEN,
    maakSessieCookie,
    rolBijWachtwoord,
    startPagina,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
    if (!process.env.SITE_PASSWORD) {
        console.error("SITE_PASSWORD env var ontbreekt — login geweigerd.");
        return NextResponse.json({ success: false }, { status: 500 });
    }

    const { password } = await req.json();

    const rol = rolBijWachtwoord(password);
    if (!rol) {
        return NextResponse.json({ success: false }, { status: 401 });
    }

    const sessie = await maakSessieCookie(rol);
    if (!sessie) {
        console.error("Sessiecookie kon niet worden ondertekend.");
        return NextResponse.json({ success: false }, { status: 500 });
    }

    const res = NextResponse.json({ success: true, rol, start: startPagina(rol) });
    res.cookies.set(SESSIE_COOKIE, sessie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: SESSIE_GELDIGHEID_SECONDEN,
    });

    // Het oude ongetekende auth-cookie opruimen; dat gaf toegang tot alles.
    res.cookies.delete("auth");

    return res;
}
