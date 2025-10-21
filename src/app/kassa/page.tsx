"use client";

import { useEffect, useMemo, useState } from "react";
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
  quantity: number | null; // alleen bij STUK
  weight_kg: number | null; // alleen bij KILO
  line_total: number;
};

function toPrice(price: number | null): number {
  return price ?? 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function explainSupabaseError(err: unknown): string {
  const asAny = err as any;
  if (asAny?.message) {
    const parts = [
      asAny.message,
      asAny.details,
      asAny.hint,
      asAny.code ? `code: ${asAny.code}` : null,
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
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalValue, setModalValue] = useState("1");

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

    // (optioneel) voorraad ophalen om alleen >0 te tonen; laat staan of haal het weg als je álle producten wilt tonen
    const ids = productsData.map((p) => p.id);
    if (ids.length > 0) {
      const { data: stockData } = await supabase
        .from("products")
        .select("id,stock_quantity")
        .in("id", ids);

      const stockMap = new Map<string, number | null>();
      (stockData ?? []).forEach((s: any) => {
        stockMap.set(s.id, s.stock_quantity);
      });

      // Toon alleen producten met voorraad > 0
      const availableProducts = productsData.filter((p) => {
        const stock = stockMap.get(p.id);
        return stock !== null && (stock as any) > 0;
      });
      setProducts(availableProducts);
    } else {
      setProducts([]);
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
          setModalOpen(false);
          setModalProduct(null);
          setModalValue("1");
        }
        if (e.key === "Enter") {
          confirmModal();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.classList.remove("overflow-hidden");
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [modalOpen, modalValue, modalProduct]);

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

  function addProduct(p: Product) {
    if (p.price == null) {
      setNotification(`Geen prijs ingesteld voor "${p.name}". Zet eerst een dagprijs.`);
      return;
    }

    // Open modal voor beide types
    setModalProduct(p);
    setModalValue("1");
    setModalOpen(true);
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
      const quantity = Math.floor(value);
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
      // KILO
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

    // Sluit modal
    setModalOpen(false);
    setModalProduct(null);
    setModalValue("1");
  }

  function updateQty(product_id: string, qty: number) {
    setCart((prev) => {
      const nextQty = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
      if (nextQty <= 0) {
        return prev.filter((ci) => !(ci.product_id === product_id && ci.unit === "STUK"));
      }
      return prev.map((ci) =>
        ci.product_id === product_id && ci.unit === "STUK"
          ? {
              ...ci,
              quantity: nextQty,
              line_total: round2(ci.unit_price * nextQty),
            }
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

      console.table(payload);

      // Gebruik throwOnError om Postgres-fouten direct te zien
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

      // Herlaad producten zodat eventuele voorraad/filtering klopt
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
          <input
            className="border border-gray-300 bg-white rounded px-3 py-2 w-64 outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 text-slate-900 placeholder:text-slate-400"
            placeholder="Zoek product…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800">
            <strong>Fout bij afrekenen:</strong> {error}
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addProduct(p)}
              className="rounded-lg border border-gray-200 bg-white p-2 text-left transition shadow-sm hover:shadow-md hover:border-green-300 hover:-translate-y-[1px] active:translate-y-[0px] flex flex-col h-full"
            >
              <div className="flex items-start justify-between gap-1 mb-1">
                <div className="font-medium text-xs leading-tight break-words text-slate-900 flex-1">
                  {p.name}
                </div>
                {p.unit === "KILO" && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-gray-300 bg-gray-50 text-slate-700">
                    KG
                  </span>
                )}
              </div>
              <div className="mt-auto pt-1">
                <div className="text-sm font-bold text-slate-900">
                  {p.price != null ? `€ ${p.price.toFixed(2)}` : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Toast notificatie */}
      {notification && (
        <div className="fixed top-4 right-4 z-[100] bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-semibold animate-[slideIn_0.3s_ease-out]">
          {notification}
        </div>
      )}

      {/* Modal voor aantal/gewicht invoeren */}
      {modalOpen && modalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setModalOpen(false);
              setModalProduct(null);
              setModalValue("1");
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-[scaleIn_0.2s_ease-out]">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{modalProduct.name}</h3>
            <p className="text-sm text-slate-600 mb-4">
              {modalProduct.unit === "KILO" ? "Hoeveel kilogram?" : "Hoeveel stuks?"}
            </p>

            <input
              type="number"
              step={modalProduct.unit === "KILO" ? "0.01" : "1"}
              min={modalProduct.unit === "KILO" ? "0.01" : "1"}
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              autoFocus
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold text-slate-900 focus:border-green-400 focus:ring-2 focus:ring-green-400 focus:outline-none"
              placeholder={modalProduct.unit === "KILO" ? "bijv. 1.50" : "bijv. 3"}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setModalProduct(null);
                  setModalValue("1");
                }}
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
                            min={0}
                            step={1}
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
