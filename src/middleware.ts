import { NextRequest, NextResponse } from "next/server";
import { SESSIE_COOKIE, isOpenbaarPad, leesSessieCookie, magPad } from "@/lib/auth";

export async function middleware(req: NextRequest) {
    const pad = req.nextUrl.pathname;

    // Login en uitloggen moeten altijd bereikbaar zijn.
    if (isOpenbaarPad(pad)) {
        return NextResponse.next();
    }

    const rol = await leesSessieCookie(req.cookies.get(SESSIE_COOKIE)?.value);

    if (!rol) {
        const res = NextResponse.redirect(new URL("/login", req.url));
        // Oud of vervalst cookie meteen weggooien.
        res.cookies.delete(SESSIE_COOKIE);
        res.cookies.delete("auth");
        return res;
    }

    if (!magPad(rol, pad)) {
        if (pad.startsWith("/api/")) {
            return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/kassa", req.url));
    }

    // Een medewerker werkt alleen in de kassa; die hoeft geen startpagina.
    if (rol === "medewerker" && pad === "/") {
        return NextResponse.redirect(new URL("/kassa", req.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
