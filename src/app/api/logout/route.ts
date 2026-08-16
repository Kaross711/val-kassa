import { NextRequest, NextResponse } from "next/server";
import { SESSIE_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
    // 303 zodat de browser na het formulier een GET doet op /login.
    const res = NextResponse.redirect(new URL("/login", req.url), 303);
    res.cookies.delete(SESSIE_COOKIE);
    res.cookies.delete("auth");
    return res;
}
