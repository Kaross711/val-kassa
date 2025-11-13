// app/layout.tsx
import "./globals.css";
import Link from "next/link";
import FuturisticLogo from "@/app/components/FuturisticLogo";
import BackgroundFX from "@/app/components/BackgroundFX";
import Floatingemojis from "@/app/components/Floatingemojis";

export const metadata = {
    title: "Val-Kassa",
    description: "Kassasysteem voor dagelijkse verkoop",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="nl">
        <body className="min-h-screen bg-white text-slate-900 selection:bg-green-400/20 selection:text-green-900">
        <BackgroundFX />
        <Floatingemojis />
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-md shadow-sm">
            <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
                <Link href="/" className="flex items-center gap-2">
                    <FuturisticLogo className="text-lg" />
                </Link>
                <div className="ml-auto flex items-center gap-2">
                    <NavLink href="/kassa">Kassa</NavLink>
                    <NavLink href="/inkoop">Inkoop</NavLink>
                    <NavLink href="/bestellen">Bestellen</NavLink>
                    <NavLink href="/verkoop">Verkoop</NavLink>
                </div>
            </nav>
        </header>

        <main className="relative z-10 mx-auto max-w-6xl p-4 md:p-6">
            {children}
        </main>
        </body>
        </html>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="relative px-3 py-1.5 text-sm text-slate-700 hover:text-slate-900 transition font-medium
                 after:absolute after:inset-x-2 after:-bottom-[2px] after:h-[2px] after:scale-x-0 after:bg-gradient-to-r
                 after:from-green-400 after:via-orange-400 after:to-red-500 after:rounded-full
                 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
            {children}
        </Link>
    );
}