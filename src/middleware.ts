import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
    const isAuthenticated = req.cookies.get("auth")?.value === "true";

    if (isAuthenticated) {
        return NextResponse.next();
    }

    // Login page zelf niet blokkeren
    if (req.nextUrl.pathname === "/login") {
        return NextResponse.next();
    }

    // API route voor login niet blokkeren
    if (req.nextUrl.pathname === "/api/login") {
        return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
