"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(false);

        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        });

        if (res.ok) {
            router.push("/");
            router.refresh();
        } else {
            setError(true);
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-orange-50 to-red-50">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-4"
            >
                <h1 className="text-2xl font-bold text-slate-900 text-center">Val Kassa</h1>
                <p className="text-sm text-slate-600 text-center">Voer het wachtwoord in om door te gaan</p>

                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Wachtwoord"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400"
                    autoFocus
                />

                {error && (
                    <p className="text-red-600 text-sm text-center">Onjuist wachtwoord</p>
                )}

                <button
                    type="submit"
                    disabled={loading || !password}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-md"
                >
                    {loading ? "Laden..." : "Inloggen"}
                </button>
            </form>
        </div>
    );
}
