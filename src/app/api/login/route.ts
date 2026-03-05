import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "valkassa2024";

export async function POST(req: NextRequest) {
    const { password } = await req.json();

    if (password === SITE_PASSWORD) {
        const res = NextResponse.json({ success: true });
        res.cookies.set("auth", "true", {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            maxAge: 60 * 60 * 24 * 30, // 30 dagen
        });
        return res;
    }

    return NextResponse.json({ success: false }, { status: 401 });
}
