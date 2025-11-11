"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Unit = "KILO" | "STUK";

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
    }, [modalOpen, modalValue, modalProduct, editMode]);

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

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const filtered = useMemo(
        () => products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
        [products, q]
    );

    const total = useMemo(
        () => round2(cart.reduce((s, ci) => s + ci.line_total, 0)),
        [cart]
    );

    function closeModal() {
        setModalOpen(false);
        setModalProduct(null);
        setModalValue("1");
        setEditMode(false);
        setEditPrice("");
        setEditStock("");
    }

    function closeAddProductModal() {
        setAddProductOpen(false);
        setNewProductName("");
        setNewProductUnit("STUK");
        setNewProductPrice("");
        setNewProductStock("");
    }

    function addProduct(p: Product) {
        if (p.price == null) {
            setNotification(`Geen prijs ingesteld voor "${p.name}". Zet eerst een dagprijs.`);
            return;
        }

        if (p.stock_quantity === null || p.stock_quantity <= 0) {
            setNotification(`Let op: "${p.name}" OP!`);
        }

        setModalProduct(p);
        setModalValue("1");
        setEditMode(false);
        setModalOpen(true);
    }

    function openEditMode() {
        if (!modalProduct) return;
        setEditMode(true);
        setEditPrice(modalProduct.price?.toString() ?? "");
        setEditStock(modalProduct.stock_quantity?.toString() ?? "0");
    }

    async function saveProductChanges() {
        if (!modalProduct) return;

        setSaving(true);
        let hasError = false;

        // Prijs opslaan
        if (editPrice.trim()) {
            const numeric = Number(editPrice.replace(",", "."));
            if (!Number.isNaN(numeric)) {
                const { error } = await supabase.rpc("set_price", {
                    _product_id: modalProduct.id,
                    _price: numeric,
                });
                if (error) {
                    setNotification(`Fout bij prijs opslaan: ${error.message}`);
                    hasError = true;
                }
            }
        }

        // Voorraad opslaan
        if (editStock.trim()) {
            const numeric = Number(editStock);
            if (!Number.isNaN(numeric) && numeric >= 0) {
                const { error } = await supabase
                    .from("products")
                    .update({ stock_quantity: numeric })
                    .eq("id", modalProduct.id);
                if (error) {
                    setNotification(`Fout bij voorraad opslaan: ${error.message}`);
                    hasError = true;
                }
            }
        }

        if (!hasError) {
            setNotification("✓ Product bijgewerkt");
            await loadProducts();
            closeModal();
        }

        setSaving(false);
    }

    async function deleteProduct() {
        if (!modalProduct) return;

        const ok = confirm(`Weet je zeker dat je "${modalProduct.name}" wilt verbergen?`);
        if (!ok) return;

        setSaving(true);
        const { error } = await supabase
            .from("products")
            .update({ is_active: false })
            .eq("id", modalProduct.id);

        if (error) {
            setNotification(`Fout: ${error.message}`);
        } else {
            setNotification("✓ Product verborgen");
            await loadProducts();
            closeModal();
        }
        setSaving(false);
    }

    async function restoreProduct(id: string) {
        setSaving(true);
        const { error } = await supabase
            .from("products")
            .update({ is_active: true })
            .eq("id", id);

        if (error) {
            setNotification(`Fout: ${error.message}`);
        } else {
            setNotification("✓ Product hersteld");
            await loadProducts();
        }
        setSaving(false);
    }

    async function createNewProduct() {
        const name = newProductName.trim();
        if (!name) {
            setNotification("Naam is verplicht");
            return;
        }

        const hasPrice = newProductPrice.trim().length > 0;
        const parsedPrice = hasPrice ? Number(newProductPrice.trim().replace(",", ".")) : null;

        const hasStock = newProductStock.trim().length > 0;
        const parsedStock = hasStock ? Number(newProductStock.trim()) : 0;

        if (hasPrice && (parsedPrice === null || Number.isNaN(parsedPrice))) {
            setNotification("Voer een geldige prijs in");
            return;
        }

        if (hasStock && (parsedStock === null || Number.isNaN(parsedStock) || parsedStock < 0)) {
            setNotification("Voer een geldige voorraad in");
            return;
        }

        setSaving(true);

        const { data: inserted, error: insertErr } = await supabase
            .from("products")
            .insert([{ name, unit: newProductUnit, stock_quantity: parsedStock }])
            .select("id")
            .single();

        let newId: string | undefined = inserted?.id as string | undefined;

        if (insertErr) {
            const { data: existingHidden, error: checkErr } = await supabase
                .from("products")
                .select("id, is_active")
                .eq("name", name)
                .single();

            if (!checkErr && existingHidden && (existingHidden as { is_active: boolean }).is_active === false) {
                const { data: restored, error: restoreErr } = await supabase
                    .from("products")
                    .update({ is_active: true, unit: newProductUnit, stock_quantity: parsedStock })
                    .eq("id", (existingHidden as { id: string }).id)
                    .select("id")
                    .single();

                if (restoreErr) {
                    setNotification(`Fout: ${restoreErr.message}`);
                    setSaving(false);
                    return;
                }
                newId = (restored as { id: string }).id;
            } else {
                setNotification(`Fout: ${insertErr.message}`);
                setSaving(false);
                return;
            }
        }

        if (newId && hasPrice && parsedPrice !== null) {
            const { error: priceErr } = await supabase.rpc("set_price", {
                _product_id: newId,
                _price: parsedPrice,
            });
            if (priceErr) {
                setNotification(`Prijs niet opgeslagen: ${priceErr.message}`);
            }
        }

        setNotification("✓ Product toegevoegd");
        await loadProducts();
        closeAddProductModal();
        setSaving(false);
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

    function removeItem(product_id: string) {
        setCart((prev) => prev.filter((ci) => ci.product_id !== product_id));
    }

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

            const { data } = await supabase
                .rpc("checkout_create", {
                    _items: payload,
                    _note: note || null,
                    _paid_at: new Date().toISOString(),
                })
                .throwOnError();

            setCart([]);
            setNote("");
            setOpen(false);
            setNotification(`✓ Bestelling opgeslagen. Bonnr: ${data}`);
            await loadProducts();
        } catch (err) {
            console.error("Checkout RPC error:", err);
            setError(explainSupabaseError(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="pb-20 p-4 md:p-6 text-slate-900">
            <div className="mx-auto max-w-7xl">
                <div className="flex items-center justify-between mb-4 gap-3">
                    <h1 className="text-3xl font-bold text-slate-900">Kassa</h1>
                    <div className="flex items-center gap-2">
                        <input
                            className="border border-gray-300 bg-white rounded px-3 py-2 w-64 outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 text-slate-900 placeholder:text-slate-400"
                            placeholder="Zoek product…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                        <button
                            onClick={() => setAddProductOpen(true)}
                            className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:brightness-110 transition shadow-md whitespace-nowrap"
                        >
                            + Product
                        </button>
                    </div>
                </div>

                {/* Tabs voor actief/verborgen */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setShowArchived(false)}
                        className={`px-4 py-2 rounded-lg font-semibold transition ${
                            !showArchived
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-gray-200 text-slate-700 hover:bg-gray-50"
                        }`}
                    >
                        Actieve producten
                    </button>
                    <button
                        onClick={() => setShowArchived(true)}
                        className={`px-4 py-2 rounded-lg font-semibold transition ${
                            showArchived
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-gray-200 text-slate-700 hover:bg-gray-50"
                        }`}
                    >
                        Verborgen producten ({archivedProducts.length})
                    </button>
                </div>

                {error && (
                    <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800">
                        <strong>Fout bij afrekenen:</strong> {error}
                    </div>
                )}

                {!showArchived ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                        {filtered.map((p) => {
                            const outOfStock = p.stock_quantity === null || p.stock_quantity <= 0;

                            return (
                                <button
                                    key={p.id}
                                    onClick={() => addProduct(p)}
                                    className={`rounded-lg border p-2 text-left transition shadow-sm flex flex-col h-full relative ${
                                        outOfStock
                                            ? "border-orange-300 bg-orange-50"
                                            : "border-gray-200 bg-white"
                                    } hover:shadow-md hover:border-green-300 hover:-translate-y-[1px] active:translate-y-[0px]`}
                                >
                                    {/* Tags boven elkaar in rechterbovenhoek */}
                                    <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
                                        {outOfStock && (
                                            <div className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-semibold leading-none">
                                                Op
                                            </div>
                                        )}
                                        {p.unit === "KILO" && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                                outOfStock
                                                    ? "border-orange-400 bg-orange-100 text-orange-800"
                                                    : "border-gray-300 bg-gray-50 text-slate-700"
                                            }`}>
                                                KG
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-start mb-1">
                                        <div className={`font-medium text-xs leading-tight break-words flex-1 ${
                                            outOfStock || p.unit === "KILO" ? "pr-10" : ""
                                        } ${outOfStock ? "text-orange-900" : "text-slate-900"}`}>
                                            {p.name}
                                        </div>
                                    </div>
                                    <div className="mt-auto pt-1">
                                        <div className={`text-sm font-bold ${
                                            outOfStock ? "text-orange-900" : "text-slate-900"
                                        }`}>
                                            {p.price != null ? `€ ${p.price.toFixed(2)}` : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {archivedProducts.length === 0 ? (
                            <div className="text-center py-12 text-slate-600">
                                <p className="text-lg font-medium">Geen verborgen producten</p>
                                <p className="text-sm mt-1">Producten die je verbergt verschijnen hier</p>
                            </div>
                        ) : (
                            archivedProducts.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="font-medium text-slate-900">{p.name}</div>
                                        <span className="text-[10px] px-2 py-1 rounded-full border border-gray-300 bg-gray-50 text-slate-700">
                                            {p.unit === "KILO" ? "KG" : "ST"}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => restoreProduct(p.id)}
                                        disabled={saving}
                                        className="px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold hover:brightness-110 transition shadow-sm disabled:opacity-50"
                                    >
                                        Herstellen
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Toast notificatie */}
            {notification && (
                <div className="fixed top-4 right-4 z-[100] bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-semibold animate-[slideIn_0.3s_ease-out]">
                    {notification}
                </div>
            )}

            {/* Modal voor nieuw product toevoegen */}
            {addProductOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={closeAddProductModal}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-[scaleIn_0.2s_ease-out]">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">Nieuw product toevoegen</h3>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Productnaam *
                                </label>
                                <input
                                    type="text"
                                    value={newProductName}
                                    onChange={(e) => setNewProductName(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-slate-900"
                                    placeholder="bijv. Tomaten"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Eenheid *
                                </label>
                                <select
                                    value={newProductUnit}
                                    onChange={(e) => setNewProductUnit(e.target.value as Unit)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-slate-900"
                                >
                                    <option value="STUK">Per stuk</option>
                                    <option value="KILO">Per kilo</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Prijs (optioneel)
                                </label>
                                <input
                                    type="text"
                                    value={newProductPrice}
                                    onChange={(e) => setNewProductPrice(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-slate-900"
                                    placeholder="bijv. 2.50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Voorraad (optioneel)
                                </label>
                                <input
                                    type="number"
                                    step={newProductUnit === "KILO" ? "0.01" : "1"}
                                    value={newProductStock}
                                    onChange={(e) => setNewProductStock(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-slate-900"
                                    placeholder={newProductUnit === "KILO" ? "bijv. 10.5" : "bijv. 50"}
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
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:brightness-110 transition shadow-md disabled:opacity-50"
                            >
                                {saving ? "Bezig..." : "Toevoegen"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal voor aantal/gewicht invoeren + product beheer */}
            {modalOpen && modalProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={closeModal}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-[scaleIn_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">{modalProduct.name}</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {modalProduct.unit === "KILO" ? "Per kilo" : "Per stuk"}
                                </p>
                            </div>
                            {!editMode && (
                                <button
                                    onClick={openEditMode}
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    Beheren
                                </button>
                            )}
                        </div>

                        {!editMode ? (
                            <>
                                <p className="text-sm text-slate-600 mb-4">
                                    {modalProduct.unit === "KILO" ? "Hoeveel kilogram?" : "Hoeveel stuks?"}
                                </p>

                                <input
                                    type="number"
                                    step={modalProduct.unit === "KILO" ? "0.01" : "0.01"}
                                    min="0.01"
                                    value={modalValue}
                                    onChange={(e) => setModalValue(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    autoFocus
                                    className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold text-slate-900 focus:border-green-400 focus:ring-2 focus:ring-green-400 focus:outline-none"
                                    placeholder={modalProduct.unit === "KILO" ? "bijv. 1.50" : "bijv. 3"}
                                />

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={closeModal}
                                        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition"
                                    >
                                        Annuleren
                                    </button>
                                    <button
                                        onClick={confirmModal}
                                        className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold hover:brightness-110 transition shadow-md"
                                    >
                                        Toevoegen
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-4">
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <div className="text-xs text-slate-600 mb-1">Huidige prijs</div>
                                        <div className="text-lg font-bold text-slate-900">
                                            {modalProduct.price != null ? `€ ${modalProduct.price.toFixed(2)}` : "Geen prijs"}
                                        </div>
                                        <div className="text-xs text-slate-600 mt-2 mb-1">Nieuwe prijs</div>
                                        <input
                                            type="text"
                                            value={editPrice}
                                            onChange={(e) => setEditPrice(e.target.value)}
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-slate-900"
                                            placeholder="bijv. 2.50"
                                        />
                                    </div>

                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <div className="text-xs text-slate-600 mb-1">Huidige voorraad</div>
                                        <div className="text-lg font-bold text-slate-900">
                                            {modalProduct.stock_quantity ?? 0} {modalProduct.unit === "KILO" ? "kg" : "st."}
                                        </div>
                                        <div className="text-xs text-slate-600 mt-2 mb-1">Nieuwe voorraad</div>
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
            <div className="fixed bottom-0 inset-x-0 border-t border-gray-200 bg-white shadow-lg">
                <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="text-lg relative">
                        <span className="font-semibold text-slate-900">Totaal</span>{" "}
                        <span className="relative inline-block text-slate-900 font-bold">
                            € {total.toFixed(2)}
                        </span>
                    </div>
                    <button
                        onClick={() => cart.length && setOpen(true)}
                        disabled={cart.length === 0}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-md"
                    >
                        Bekijk bon
                    </button>
                </div>
            </div>

            {/* Drawer overlay */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-white shadow-xl border-l border-gray-200 flex flex-col"
                    >
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                            <h2 className="text-xl font-semibold text-slate-900">Winkelmand</h2>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-sm text-slate-600 hover:text-slate-900 font-medium"
                            >
                                Sluiten ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
                            {cart.length === 0 ? (
                                <p className="text-slate-600 text-sm">Nog geen items.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {cart.map((ci, idx) => (
                                        <li
                                            key={`${ci.product_id}-${idx}`}
                                            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
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
                                className="w-full py-2 rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-md"
                            >
                                {saving ? "Opslaan…" : "Afrekenen"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}