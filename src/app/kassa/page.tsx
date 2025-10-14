"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Unit = "KILO" | "STUK";

type Product = {
    id: string;
    name: string;
    unit: Unit;
    price: number | null;
};

type CartItem = {
    product_id: string;
    name: string;
    unit: Unit;
    unit_price: number;
    quantity: number | null;
    weight_kg: number | null;
    line_total: number;
};

export default function KassaPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [q, setQ] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false); // drawer open/close

    // ---------- Data ----------
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase
                .from("products_with_price")
                .select("id,name,unit,price")
                .order("name");
            if (error) setError(error.message);
            else setProducts((data ?? []) as Product[]);
        })();
    }, []);

    // Lock scroll when drawer open
    useEffect(() => {
        if (open) document.body.classList.add("overflow-hidden");
        else document.body.classList.remove("overflow-hidden");
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.classList.remove("overflow-hidden");
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const filtered = useMemo(
        () => products.filter(p => p.name.toLowerCase().includes(q.toLowerCase())),
        [products, q]
    );

    const total = useMemo(
        () => round2(cart.reduce((s, ci) => s + ci.line_total, 0)),
        [cart]
    );

    function round2(n: number) {
        return Math.round(n * 100) / 100;
    }

    // ---------- Cart ops ----------
    function addProduct(p: Product) {
        if (p.price == null) {
            alert(`Geen prijs ingesteld voor "${p.name}". Zet eerst een dagprijs.`);
            return;
        }

        if (p.unit === "STUK") {
            const idx = cart.findIndex(ci => ci.product_id === p.id && ci.unit === "STUK" && ci.unit_price === p.price);
            if (idx >= 0) {
                const next = [...cart];
                const cur = next[idx];
                const qty = (cur.quantity ?? 0) + 1;
                next[idx] = { ...cur, quantity: qty, line_total: round2(qty * cur.unit_price) };
                setCart(next);
            } else {
                setCart(prev => [
                    ...prev,
                    {
                        product_id: p.id,
                        name: p.name,
                        unit: "STUK",
                        unit_price: p.price,
                        quantity: 1,
                        weight_kg: null,
                        line_total: round2(p.price * 1),
                    },
                ]);
            }
        } else {
            const w = prompt(`Gewicht in kg voor "${p.name}" (bijv. 0.75)`);
            if (!w) return;
            const weight = Number(String(w).replace(",", "."));
            if (isNaN(weight) || weight <= 0) {
                alert("Ongeldig gewicht");
                return;
            }
            setCart(prev => [
                ...prev,
                {
                    product_id: p.id,
                    name: p.name,
                    unit: "KILO",
                    unit_price: p.price!,
                    quantity: null,
                    weight_kg: weight,
                    line_total: round2(p.price! * weight),
                },
            ]);
        }
    }

    function updateQty(product_id: string, qty: number) {
        setCart(prev =>
            prev
                .map(ci =>
                    ci.product_id === product_id && ci.unit === "STUK"
                        ? {
                            ...ci,
                            quantity: Math.max(0, Math.floor(qty)),
                            line_total: round2(ci.unit_price * Math.max(0, Math.floor(qty))),
                        }
                        : ci
                )
                .filter(ci => !(ci.unit === "STUK" && (ci.quantity ?? 0) <= 0))
        );
    }

    function updateWeight(product_id: string, weight: number) {
        const w = Number(weight);
        setCart(prev =>
            prev
                .map(ci =>
                    ci.product_id === product_id && ci.unit === "KILO"
                        ? {
                            ...ci,
                            weight_kg: w > 0 ? w : 0,
                            line_total: round2(ci.unit_price * (w > 0 ? w : 0)),
                        }
                        : ci
                )
                .filter(ci => !(ci.unit === "KILO" && (ci.weight_kg ?? 0) <= 0))
        );
    }

    function removeItem(product_id: string) {
        setCart(prev => prev.filter(ci => ci.product_id !== product_id));
    }

    // ---------- Afrekenen ----------
    async function checkout() {
        if (cart.length === 0) return;
        setSaving(true);
        setError(null);
        try {
            const payload = cart.map(ci => ({
                product_id: ci.product_id,
                unit: ci.unit,
                quantity: ci.unit === "STUK" ? ci.quantity : null,
                weight_kg: ci.unit === "KILO" ? ci.weight_kg : null,
                unit_price: ci.unit_price,
                line_total: ci.line_total,
            }));

            const { data, error } = await supabase.rpc("checkout_create", {
                _items: payload,
                _note: note || null,
            });
            if (error) throw error;

            setCart([]);
            setNote("");
            setOpen(false);
            alert(`Bestelling opgeslagen. Bonnr: ${data}`);
        } catch (e: any) {
            setError(e.message ?? "Er is iets misgegaan");
            console.error(e);
        } finally {
            setSaving(false);
        }
    }

    // ---------- UI ----------
    return (
        <div className="p-4 md:p-6">
            <div className="mx-auto max-w-6xl">
                <div className="flex items-center justify-between mb-4 gap-3">
                    <h1 className="text-3xl font-bold">Kassa</h1>
                    <input
                        className="border rounded px-3 py-2 w-64"
                        placeholder="Zoek product…"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                    />
                </div>

                {error && <p className="text-red-600 text-sm mb-3">Fout: {error}</p>}

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map(p => (
                        <button
                            key={p.id}
                            onClick={() => addProduct(p)}
                            className="rounded-xl border hover:shadow transition p-4 text-left"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="font-medium leading-tight break-words">{p.name}</div>
                                {p.unit === "KILO" && (
                                    <span className="shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded-full border">
                    KILO
                  </span>
                                )}
                            </div>
                            <div className="mt-2 text-lg font-bold">
                                {p.price != null ? `€ ${p.price.toFixed(2)}` : <span className="opacity-60">—</span>}
                            </div>
                            <div className="mt-3 text-sm text-right opacity-70">Klik om toe te voegen</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Sticky bottom bar */}
            <div className="fixed bottom-0 inset-x-0 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
                <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="text-lg">
                        <span className="font-semibold">Totaal</span>{" "}
                        <span>€ {total.toFixed(2)}</span>
                    </div>
                    <button
                        onClick={() => cart.length && setOpen(true)}
                        disabled={cart.length === 0}
                        className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                    >
                        Bekijk bon
                    </button>
                </div>
            </div>

            {/* Drawer overlay */}
            {open && (
                <div className="fixed inset-0 z-50">
                    {/* backdrop */}
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    {/* panel */}
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-white shadow-xl flex flex-col"
                    >
                        <div className="p-4 border-b flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Winkelmand</h2>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-sm opacity-70 hover:opacity-100"
                            >
                                Sluiten ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4 space-y-3">
                            {cart.length === 0 ? (
                                <p className="opacity-70 text-sm">Nog geen items.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {cart.map(ci => (
                                        <li key={ci.product_id} className="border rounded-lg p-3">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium leading-tight break-words">{ci.name}</div>
                                                <button
                                                    onClick={() => removeItem(ci.product_id)}
                                                    className="text-sm opacity-60 hover:opacity-100"
                                                >
                                                    verwijderen
                                                </button>
                                            </div>

                                            <div className="mt-1 text-xs opacity-70">
                                                € {ci.unit_price.toFixed(2)} {ci.unit === "KILO" ? "/ KILO" : "/ STUK"}
                                            </div>

                                            {ci.unit === "STUK" ? (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <button
                                                        onClick={() => updateQty(ci.product_id, (ci.quantity ?? 0) - 1)}
                                                        className="px-2 py-1 border rounded"
                                                    >
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        value={ci.quantity ?? 0}
                                                        onChange={e => updateQty(ci.product_id, Number(e.target.value))}
                                                        className="w-20 border rounded px-2 py-1"
                                                    />
                                                    <button
                                                        onClick={() => updateQty(ci.product_id, (ci.quantity ?? 0) + 1)}
                                                        className="px-2 py-1 border rounded"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-sm opacity-70">kg</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={ci.weight_kg ?? 0}
                                                        onChange={e => updateWeight(ci.product_id, Number(e.target.value))}
                                                        className="w-24 border rounded px-2 py-1"
                                                    />
                                                </div>
                                            )}

                                            <div className="mt-2 text-right font-semibold">
                                                € {ci.line_total.toFixed(2)}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="border-t p-4 space-y-3">
                            <div className="flex items-center justify-between text-lg font-bold">
                                <span>Totaal</span>
                                <span>€ {total.toFixed(2)}</span>
                            </div>
                            <input
                                className="border rounded px-3 py-2 w-full"
                                placeholder="Notitie (optioneel)"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                            />
                            <button
                                onClick={checkout}
                                disabled={cart.length === 0 || saving}
                                className="w-full py-2 rounded-xl bg-black text-white disabled:opacity-50"
                            >
                                {saving ? "Opslaan…" : "Opslaan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
