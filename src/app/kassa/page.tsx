"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Unit = "KILO" | "STUK";

// Nieuw: type voor soort verkoop
type SaleType = "WINKEL" | "BESTELLING" | "BEDRIJF";

type Product = {
    id: string;
    name: string;
    unit: Unit;
    price: number | null;
    stock_quantity: number | null;
};

type ArchivedProduct = {
    id: string;
    name: string;
    unit: Unit;
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

function toPrice(price: number | null): number {
    return price ?? 0;
}

function round2(n: number) {
    return Math.round(n * 100) / 100;
}

function explainSupabaseError(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
        const error = err as { message?: string; details?: string; hint?: string; code?: string };
        const parts = [
            error.message,
            error.details,
            error.hint,
            error.code ? `code: ${error.code}` : null,
        ].filter(Boolean);
        return parts.join(" — ");
    }
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

export default function KassaPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [archivedProducts, setArchivedProducts] = useState<ArchivedProduct[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [q, setQ] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [notification, setNotification] = useState<string | null>(null);

    // Nieuw: type verkoop selectie
    const [saleType, setSaleType] = useState<SaleType>("WINKEL");

    // Modal state voor winkelwagen
    const [modalOpen, setModalOpen] = useState(false);
    const [modalProduct, setModalProduct] = useState<Product | null>(null);
    const [modalValue, setModalValue] = useState("1");

    // Modal state voor product beheer
    const [editMode, setEditMode] = useState(false);
    const [editPrice, setEditPrice] = useState("");
    const [editStock, setEditStock] = useState("");

    // Nieuw product modal
    const [addProductOpen, setAddProductOpen] = useState(false);
    const [newProductName, setNewProductName] = useState("");
    const [newProductUnit, setNewProductUnit] = useState<Unit>("STUK");
    const [newProductPrice, setNewProductPrice] = useState("");
    const [newProductStock, setNewProductStock] = useState("");

    // Ref voor auto-focus op input
    const modalInputRef = useRef<HTMLInputElement>(null);


    // ---------- Data loading ----------
    async function loadProducts() {
        const { data, error } = await supabase
            .from("products_with_price")
            .select("id,name,unit,price")
            .order("name");

        if (error) {
            setError(error.message);
            return;
        }

        const productsData = (data ?? []) as Product[];

        const ids = productsData.map((p) => p.id);
        if (ids.length > 0) {
            const { data: stockData } = await supabase
                .from("products")
                .select("id,stock_quantity")
                .in("id", ids);

            const stockMap = new Map<string, number | null>();
            (stockData ?? []).forEach((s: { id: string; stock_quantity: number | null }) => {
                stockMap.set(s.id, s.stock_quantity);
            });

            const productsWithStock = productsData.map((p) => ({
                ...p,
                stock_quantity: stockMap.get(p.id) ?? null,
            }));

            setProducts(productsWithStock);
        } else {
            setProducts([]);
        }

        // Verborgen producten ophalen
        const { data: hidden, error: hiddenErr } = await supabase
            .from("products")
            .select("id,name,unit")
            .eq("is_active", false)
            .order("name");

        if (hiddenErr) {
            console.error("Supabase fout (verborgen laden):", hiddenErr);
        } else {
            const hiddenWithStock = (hidden ?? []).map((p) => ({
                ...(p as { id: string; name: string; unit: Unit }),
                price: null,
                stock_quantity: null,
            }));
            setArchivedProducts(hiddenWithStock);
        }
    }

    useEffect(() => {
        loadProducts();
    }, []);

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

    useEffect(() => {
        if (modalOpen) {
            document.body.classList.add("overflow-hidden");
            // Auto-focus op input veld na kleine delay (voor animatie)
            setTimeout(() => {
                if (modalInputRef.current && !editMode) {
                    modalInputRef.current.focus();
                    modalInputRef.current.select(); // Selecteer de inhoud direct
                }
            }, 100);

            const onKey = (e: KeyboardEvent) => {
                if (e.key === "Escape") {
                    closeModal();
                }
                if (e.key === "Enter" && !editMode) {
                    confirmModal();
                }
            };
            window.addEventListener("keydown", onKey);
            return () => {
                document.body.classList.remove("overflow-hidden");
                window.removeEventListener("keydown", onKey);
            };
        }
    }, [modalOpen, editMode]);

    useEffect(() => {
        if (addProductOpen) {
            document.body.classList.add("overflow-hidden");
            const onKey = (e: KeyboardEvent) => {
                if (e.key === "Escape") {
                    closeAddProductModal();
                }
            };
            window.addEventListener("keydown", onKey);
            return () => {
                document.body.classList.remove("overflow-hidden");
                window.removeEventListener("keydown", onKey);
            };
        }
    }, [addProductOpen]);

    // ---------- Product modal functies ----------
    function openModal(p: Product) {
        setModalProduct(p);
        setModalOpen(true);
        setEditMode(false);
        setModalValue("1");
    }

    function closeModal() {
        setModalOpen(false);
        setModalProduct(null);
        setModalValue("1");
        setEditMode(false);
        setEditPrice("");
        setEditStock("");
    }

    function confirmModal() {
        if (!modalProduct) return;

        const value = Number(String(modalValue).replace(",", "."));
        if (isNaN(value) || value <= 0) {
            setNotification("Ongeldig aantal");
            return;
        }

        const p = modalProduct;

        if (p.unit === "STUK") {
            const quantity = Math.round(value * 100) / 100;
            const idx = cart.findIndex(
                (ci) => ci.product_id === p.id && ci.unit === "STUK" && ci.unit_price === p.price
            );
            if (idx >= 0) {
                const next = [...cart];
                const cur = next[idx];
                const newQty = (cur.quantity ?? 0) + quantity;
                next[idx] = { ...cur, quantity: newQty, line_total: round2(newQty * cur.unit_price) };
                setCart(next);
            } else {
                setCart((prev) => [
                    ...prev,
                    {
                        product_id: p.id,
                        name: p.name,
                        unit: "STUK",
                        unit_price: toPrice(p.price),
                        quantity: quantity,
                        weight_kg: null,
                        line_total: round2(toPrice(p.price) * quantity),
                    },
                ]);
            }
        } else {
            setCart((prev) => [
                ...prev,
                {
                    product_id: p.id,
                    name: p.name,
                    unit: "KILO",
                    unit_price: toPrice(p.price),
                    quantity: null,
                    weight_kg: value,
                    line_total: round2(toPrice(p.price) * value),
                },
            ]);
        }

        closeModal();
    }

    function enterEditMode() {
        if (!modalProduct) return;
        setEditMode(true);
        setEditPrice(modalProduct.price?.toString() ?? "");
        setEditStock(modalProduct.stock_quantity?.toString() ?? "");
    }

    async function saveProductChanges() {
        if (!modalProduct) return;
        setSaving(true);
        setError(null);

        const priceVal = parseFloat(editPrice);
        const stockVal = parseFloat(editStock);

        if (isNaN(priceVal) || isNaN(stockVal)) {
            setError("Prijs en voorraad moeten getallen zijn.");
            setSaving(false);
            return;
        }

        // Check of er al een prijs bestaat voor dit product
        const { data: existingPrice } = await supabase
            .from("prices")
            .select("id, product_id, price")
            .eq("product_id", modalProduct.id)
            .order("valid_from", { ascending: false })
            .limit(1)
            .single();

        if (existingPrice) {
            // Update bestaande prijs
            const { error: priceErr } = await supabase
                .from("prices")
                .update({ price: priceVal })
                .eq("id", existingPrice.id);

            if (priceErr) {
                setError("Fout prijs opslaan: " + explainSupabaseError(priceErr));
                setSaving(false);
                return;
            }
        } else {
            // Maak nieuwe prijs aan
            const { error: priceErr } = await supabase
                .from("prices")
                .insert({
                    product_id: modalProduct.id,
                    price: priceVal,
                    valid_from: new Date().toISOString(),
                });

            if (priceErr) {
                setError("Fout prijs opslaan: " + explainSupabaseError(priceErr));
                setSaving(false);
                return;
            }
        }

        // Update voorraad in products tabel
        const { error: stockErr } = await supabase
            .from("products")
            .update({ stock_quantity: stockVal })
            .eq("id", modalProduct.id);

        if (stockErr) {
            setError("Fout voorraad opslaan: " + explainSupabaseError(stockErr));
            setSaving(false);
            return;
        }

        await loadProducts();
        setSaving(false);
        setEditMode(false);
        closeModal();
        showNotification("Product bijgewerkt!");
    }

    async function deleteProduct() {
        if (!modalProduct) return;
        setSaving(true);
        setError(null);

        const { error } = await supabase
            .from("products")
            .update({ is_active: false })
            .eq("id", modalProduct.id);

        if (error) {
            setError("Fout product verbergen: " + explainSupabaseError(error));
            setSaving(false);
            return;
        }

        await loadProducts();
        setSaving(false);
        closeModal();
        showNotification("Product verborgen!");
    }

    // ---------- Nieuw product modal functies ----------
    function openAddProductModal() {
        setAddProductOpen(true);
        setNewProductName("");
        setNewProductUnit("STUK");
        setNewProductPrice("");
        setNewProductStock("");
    }

    function closeAddProductModal() {
        setAddProductOpen(false);
        setNewProductName("");
        setNewProductUnit("STUK");
        setNewProductPrice("");
        setNewProductStock("");
    }

    async function createNewProduct() {
        setSaving(true);
        setError(null);

        const name = newProductName.trim();
        if (!name) {
            setError("Naam is verplicht.");
            setSaving(false);
            return;
        }

        const price = parseFloat(newProductPrice);
        const stock = parseFloat(newProductStock);

        if (isNaN(price) || isNaN(stock)) {
            setError("Prijs en voorraad moeten getallen zijn.");
            setSaving(false);
            return;
        }

        const { data: productData, error: productErr } = await supabase
            .from("products")
            .insert({
                name,
                unit: newProductUnit,
                stock_quantity: stock,
                is_active: true,
            })
            .select("id")
            .single();

        if (productErr) {
            setError("Fout product aanmaken: " + explainSupabaseError(productErr));
            setSaving(false);
            return;
        }

        const productId = productData.id;

        // Voeg prijs toe met valid_from
        const { error: priceErr } = await supabase.from("prices").insert({
            product_id: productId,
            price,
            valid_from: new Date().toISOString(),
        });

        if (priceErr) {
            setError("Fout prijs opslaan: " + explainSupabaseError(priceErr));
            setSaving(false);
            return;
        }

        await loadProducts();
        setSaving(false);
        closeAddProductModal();
        showNotification("Product toegevoegd!");
    }

    async function restoreProduct(productId: string) {
        const { error } = await supabase
            .from("products")
            .update({ is_active: true })
            .eq("id", productId);

        if (error) {
            setError("Fout product terugzetten: " + explainSupabaseError(error));
            return;
        }

        await loadProducts();
        showNotification("Product teruggezet!");
    }

    // ---------- Winkelwagen acties ----------
    function removeItem(productId: string) {
        setCart(cart.filter((c) => c.product_id !== productId));
    }

    function updateQty(product_id: string, qty: number) {
        setCart((prev) => {
            const nextQty = Math.max(0, Number.isFinite(qty) ? Math.round(qty * 100) / 100 : 0);
            if (nextQty <= 0) {
                return prev.filter((ci) => !(ci.product_id === product_id && ci.unit === "STUK"));
            }
            return prev.map((ci) =>
                ci.product_id === product_id && ci.unit === "STUK"
                    ? { ...ci, quantity: nextQty, line_total: round2(ci.unit_price * nextQty) }
                    : ci
            );
        });
    }

    function updateWeight(product_id: string, w: number) {
        setCart((prev) => {
            const weight = Number.isFinite(w) ? w : 0;
            if (weight <= 0) {
                return prev.filter((ci) => !(ci.product_id === product_id && ci.unit === "KILO"));
            }
            return prev.map((ci) =>
                ci.product_id === product_id && ci.unit === "KILO"
                    ? {
                        ...ci,
                        weight_kg: weight,
                        line_total: round2(ci.unit_price * weight),
                    }
                    : ci
            );
        });
    }

    // ---------- Afrekenen - AANGEPAST MET SALE_TYPE ----------
    async function checkout() {
        if (cart.length === 0) return;
        setSaving(true);
        setError(null);

        try {
            const payload = cart.map((ci) => ({
                product_id: ci.product_id,
                unit: ci.unit,
                quantity: ci.unit === "STUK" ? ci.quantity : null,
                weight_kg: ci.unit === "KILO" ? ci.weight_kg : null,
                unit_price: ci.unit_price,
                line_total: ci.line_total,
            }));

            // Gebruik de bestaande RPC functie maar voeg sale_type toe
            const { data, error: rpcError } = await supabase
                .rpc("checkout_create", {
                    _items: payload,
                    _note: note || null,
                    _paid_at: new Date().toISOString(),
                    _sale_type: saleType, // NIEUW: voeg sale_type toe
                });

            if (rpcError) {
                throw rpcError;
            }

            setCart([]);
            setNote("");
            setOpen(false);

            // Type-specifieke melding
            const typeLabels: Record<SaleType, string> = {
                WINKEL: "Winkelverkoop",
                BESTELLING: "Bestelling",
                BEDRIJF: "Bedrijfsverkoop"
            };
            showNotification(`${typeLabels[saleType]} afgerond! Bonnr: ${data}`);

            await loadProducts();
        } catch (err) {
            console.error("Checkout RPC error:", err);
            setError(explainSupabaseError(err));
        } finally {
            setSaving(false);
        }
    }

    function showNotification(msg: string) {
        setNotification(msg);
        setTimeout(() => setNotification(null), 3000);
    }

    // ---------- Filtering ----------
    const filtered = useMemo(() => {
        const term = q.toLowerCase().trim();
        if (!term) return products;
        return products.filter((p) => p.name.toLowerCase().includes(term));
    }, [products, q]);

    const total = useMemo(() => {
        return cart.reduce((sum, c) => sum + c.line_total, 0);
    }, [cart]);

    // ---------- Render ----------
    return (
        <div className="min-h-screen pb-24">
            {/* Notificatie */}
            {notification && (
                <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg">
                    {notification}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="fixed top-4 left-4 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg max-w-md">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 underline">
                        Sluiten
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm sticky top-0 z-40">
                <div className="mx-auto max-w-7xl px-4 py-4">
                    <h1 className="text-2xl font-bold text-slate-900 mb-4">Kassa</h1>

                    {/* NIEUW: Type selectie */}
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setSaleType("WINKEL")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                saleType === "WINKEL"
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Winkelverkoop
                        </button>
                        <button
                            onClick={() => setSaleType("BESTELLING")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                saleType === "BESTELLING"
                                    ? "bg-orange-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Bestelling
                        </button>
                        <button
                            onClick={() => setSaleType("BEDRIJF")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                saleType === "BEDRIJF"
                                    ? "bg-green-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Bedrijfsverkoop
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Zoek product…"
                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 bg-white text-slate-900 placeholder:text-slate-400"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                        <button
                            onClick={openAddProductModal}
                            className="px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:brightness-110 transition shadow-md whitespace-nowrap"
                        >
                            + Product
                        </button>
                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition whitespace-nowrap"
                        >
                            {showArchived ? "Verberg archief" : "Toon archief"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Producten grid */}
            <div className="mx-auto max-w-7xl px-4 py-6">
                {showArchived ? (
                    <div>
                        <h2 className="text-xl font-bold mb-4 text-slate-900">Verborgen producten</h2>
                        {archivedProducts.length === 0 ? (
                            <p className="text-slate-600">Geen verborgen producten.</p>
                        ) : (
                            <div className="grid grid-cols-5 gap-4">
                                {archivedProducts.map((p) => (
                                    <div
                                        key={p.id}
                                        className="rounded-xl border border-gray-200 bg-white/90 backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition"
                                    >
                                        <div className="font-semibold text-slate-900 mb-2">{p.name}</div>
                                        <button
                                            onClick={() => restoreProduct(p.id)}
                                            className="w-full mt-2 px-3 py-1 rounded-lg bg-green-500 text-white text-sm font-semibold hover:brightness-110 transition"
                                        >
                                            Terugzetten
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {filtered.length === 0 ? (
                            <p className="text-slate-600">Geen producten gevonden.</p>
                        ) : (
                            <div className="grid grid-cols-5 gap-3">
                                {filtered.map((p) => {
                                    const hasPrice = p.price !== null && p.price !== undefined;
                                    const hasStock = p.stock_quantity !== null && p.stock_quantity !== undefined;
                                    const stock = p.stock_quantity ?? 0;
                                    const isLowStock = hasStock && stock < 5;

                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => openModal(p)}
                                            className="rounded-xl border-2 border-gray-200 bg-white/90 backdrop-blur-sm p-3 shadow-sm hover:shadow-lg hover:border-blue-400 transition cursor-pointer active:scale-95"
                                        >
                                            <div className="font-bold text-sm text-slate-900 mb-2 leading-tight break-words min-h-[2.5rem] flex items-center">
                                                {p.name}
                                            </div>
                                            <div className="text-sm font-bold text-blue-600 mb-1">
                                                {hasPrice ? `€ ${p.price!.toFixed(2)}` : "€ -.--"}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                per {p.unit}
                                            </div>
                                            <div className={`text-xs mt-2 font-semibold ${isLowStock ? "text-red-600" : "text-green-600"}`}>
                                                {hasStock ? `${stock} ${p.unit === "KILO" ? "kg" : "st"}` : "geen voorraad"}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modals en andere UI elementen blijven hetzelfde... */}
            {/* (Te lang om hier volledig te tonen, maar zijn identiek aan de originele code) */}

            {/* Nieuw product modal */}
            {addProductOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeAddProductModal} />
                    <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold mb-4 text-slate-900">Nieuw product</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700">
                                    Productnaam
                                </label>
                                <input
                                    type="text"
                                    value={newProductName}
                                    onChange={(e) => setNewProductName(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                    placeholder="bijv. Appels"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700">
                                    Eenheid
                                </label>
                                <select
                                    value={newProductUnit}
                                    onChange={(e) => setNewProductUnit(e.target.value as Unit)}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                >
                                    <option value="STUK">STUK</option>
                                    <option value="KILO">KILO</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700">
                                    Prijs per {newProductUnit === "KILO" ? "kilo" : "stuk"} (€)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newProductPrice}
                                    onChange={(e) => setNewProductPrice(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                    placeholder="bijv. 2.50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700">
                                    Voorraad ({newProductUnit === "KILO" ? "kg" : "stuks"})
                                </label>
                                <input
                                    type="number"
                                    step={newProductUnit === "KILO" ? "0.01" : "1"}
                                    value={newProductStock}
                                    onChange={(e) => setNewProductStock(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                    placeholder={newProductUnit === "KILO" ? "bijv. 25.5" : "bijv. 100"}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={closeAddProductModal}
                                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition"
                            >
                                Annuleren
                            </button>
                            <button
                                onClick={createNewProduct}
                                disabled={saving}
                                className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:brightness-110 transition shadow-md disabled:opacity-50"
                            >
                                {saving ? "Opslaan..." : "Toevoegen"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Product modal */}
            {modalOpen && modalProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
                    <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
                        {!editMode ? (
                            <>
                                <h2 className="text-2xl font-bold mb-3 text-slate-900">{modalProduct.name}</h2>
                                <div className="text-lg text-slate-600 mb-2">
                                    € {toPrice(modalProduct.price).toFixed(2)} / {modalProduct.unit}
                                </div>
                                <div className="text-sm text-slate-500 mb-6">
                                    Voorraad:{" "}
                                    {modalProduct.stock_quantity !== null
                                        ? `${modalProduct.stock_quantity} ${modalProduct.unit === "KILO" ? "kg" : "stuks"}`
                                        : "onbekend"}
                                </div>

                                <label className="block text-lg font-semibold mb-3 text-slate-900">
                                    Aantal {modalProduct.unit === "KILO" ? "(kg)" : "(stuks)"}
                                </label>
                                <input
                                    ref={modalInputRef}
                                    type="number"
                                    inputMode="decimal"
                                    step={modalProduct.unit === "KILO" ? "0.01" : "1"}
                                    min="0.01"
                                    value={modalValue}
                                    onChange={(e) => setModalValue(e.target.value)}
                                    className="w-full border-2 border-blue-400 rounded-xl px-4 py-4 mb-6 text-2xl font-bold text-center text-slate-900 focus:border-blue-600 focus:ring-4 focus:ring-blue-200 transition"
                                />

                                <div className="space-y-3">
                                    {/* Extra grote Toevoegen knop */}
                                    <button
                                        onClick={confirmModal}
                                        className="w-full px-6 py-5 text-xl rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-bold hover:brightness-110 transition shadow-lg"
                                    >
                                        ✓ Toevoegen aan winkelwagen
                                    </button>

                                    {/* Annuleren knop */}
                                    <button
                                        onClick={closeModal}
                                        className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition"
                                    >
                                        Annuleren
                                    </button>
                                </div>

                                {/* Bewerk product klein en onderaan */}
                                <button
                                    onClick={enterEditMode}
                                    className="w-full mt-6 px-3 py-2 rounded-lg border border-gray-200 text-slate-500 text-sm hover:bg-gray-50 transition"
                                >
                                    ⚙️ Bewerk product
                                </button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-xl font-bold mb-4 text-slate-900">Bewerk product</h2>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-slate-700">
                                            Prijs per {modalProduct.unit === "KILO" ? "kilo" : "stuk"} (€)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={editPrice}
                                            onChange={(e) => setEditPrice(e.target.value)}
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                            placeholder="bijv. 2.50"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-slate-700">
                                            Voorraad ({modalProduct.unit === "KILO" ? "kg" : "stuks"})
                                        </label>
                                        <input
                                            type="number"
                                            step={modalProduct.unit === "KILO" ? "0.01" : "1"}
                                            value={editStock}
                                            onChange={(e) => setEditStock(e.target.value)}
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                            placeholder={modalProduct.unit === "KILO" ? "bijv. 25.5" : "bijv. 100"}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => setEditMode(false)}
                                        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition"
                                    >
                                        Terug
                                    </button>
                                    <button
                                        onClick={saveProductChanges}
                                        disabled={saving}
                                        className="flex-1 px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:brightness-110 transition shadow-md disabled:opacity-50"
                                    >
                                        {saving ? "Opslaan..." : "Opslaan"}
                                    </button>
                                </div>

                                <button
                                    onClick={deleteProduct}
                                    disabled={saving}
                                    className="w-full mt-3 px-4 py-2 rounded-lg border border-red-300 text-red-600 font-semibold hover:bg-red-50 transition disabled:opacity-50"
                                >
                                    Product verbergen
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Sticky bottom bar */}
            <div className="fixed bottom-0 inset-x-0 border-t-2 border-gray-200 bg-white/95 backdrop-blur-md shadow-2xl">
                <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold text-slate-700">Totaal:</span>
                        <span className="text-3xl font-bold text-slate-900">
                            € {total.toFixed(2)}
                        </span>
                        <span className="text-sm text-slate-500 ml-2">
                            ({cart.length} {cart.length === 1 ? "item" : "items"})
                        </span>
                    </div>
                    <button
                        onClick={() => cart.length && setOpen(true)}
                        disabled={cart.length === 0}
                        className="px-8 py-4 text-xl rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-bold disabled:opacity-50 hover:brightness-110 transition shadow-xl active:scale-95"
                    >
                        🛒 Bekijk bon
                    </button>
                </div>
            </div>

            {/* Drawer overlay */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-white/95 backdrop-blur-md shadow-xl border-l border-gray-200 flex flex-col"
                    >
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
                            <h2 className="text-xl font-semibold text-slate-900">Winkelmand</h2>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-sm text-slate-600 hover:text-slate-900 font-medium"
                            >
                                Sluiten ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50/50">
                            {cart.length === 0 ? (
                                <p className="text-slate-600 text-sm">Nog geen items.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {cart.map((ci, idx) => (
                                        <li
                                            key={`${ci.product_id}-${idx}`}
                                            className="rounded-lg border border-gray-200 bg-white/90 backdrop-blur-sm p-3 shadow-sm"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium leading-tight break-words text-slate-900">
                                                    {ci.name}
                                                </div>
                                                <button
                                                    onClick={() => removeItem(ci.product_id)}
                                                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                                                >
                                                    verwijderen
                                                </button>
                                            </div>

                                            <div className="mt-1 text-xs text-slate-600">
                                                € {ci.unit_price.toFixed(2)} {ci.unit === "KILO" ? "/ KILO" : "/ STUK"}
                                            </div>

                                            {ci.unit === "STUK" ? (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <button
                                                        onClick={() => updateQty(ci.product_id, (ci.quantity ?? 0) - 1)}
                                                        className="px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 text-slate-900"
                                                    >
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        value={ci.quantity ?? 0}
                                                        onChange={(e) => updateQty(ci.product_id, Number(e.target.value || 0))}
                                                        className="w-20 border border-gray-300 rounded px-2 py-1 bg-white text-slate-900"
                                                    />
                                                    <button
                                                        onClick={() => updateQty(ci.product_id, (ci.quantity ?? 0) + 1)}
                                                        className="px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 text-slate-900"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <label className="text-sm text-slate-600">kg</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={ci.weight_kg ?? 0}
                                                        onChange={(e) => updateWeight(ci.product_id, Number(e.target.value || 0))}
                                                        className="w-24 border border-gray-300 rounded px-2 py-1 bg-white text-slate-900"
                                                    />
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200 space-y-3 bg-white">
                            <textarea
                                placeholder="Opmerking (optioneel)…"
                                className="w-full h-20 border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                            <button
                                onClick={checkout}
                                disabled={saving || cart.length === 0}
                                className="w-full py-5 text-xl rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-bold disabled:opacity-50 hover:brightness-110 transition shadow-xl active:scale-95"
                            >
                                {saving ? "⏳ Opslaan…" : "✓ AFREKENEN"}
                                
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}