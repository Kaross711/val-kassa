import "./globals.css";
import Link from "next/link";

export const metadata = {
    title: "Val-Kassa",
    description: "Kassasysteem voor dagelijkse verkoop",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="nl">
        <body className="min-h-screen bg-white text-gray-900">
        <header className="border-b bg-gray-50">
            <nav className="max-w-6xl mx-auto flex items-center gap-6 px-6 py-3">
                <Link href="/" className="font-semibold text-lg">
                    💶 Val-Kassa
                </Link>
                <Link href="/kassa" className="hover:text-black text-gray-600">
                    Kassa
                </Link>
                <Link href="/admin/prices" className="hover:text-black text-gray-600">
                    Dagprijzen
                </Link>
                <Link href="/verkoop" className="hover:text-black text-gray-600">
                    Verkoop
                </Link>
            </nav>
        </header>

        <main className="p-4">{children}</main>
        </body>
        </html>
    );
}
