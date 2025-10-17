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
  const [open, setOpen] = useState(false);

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

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
    () => products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [products, q]
  );

  const total = useMemo(() => round2(cart.reduce((s, ci) => s + ci.line_total, 0)), [cart]);

  function addProduct(p: Product) {
    if (p.price == null) {
      alert(`Geen prijs ingesteld voor "${p.name}". Zet eerst een dagprijs.`);
      return;
    }

    if (p.unit === "STUK") {
      const idx = cart.findIndex(
        (ci) => ci.product_id === p.id && ci.unit === "STUK" && ci.unit_price === p.price
      );
      if (idx >= 0) {
        const next = [...cart];
        const cur = next[idx];
        const qty = (cur.quantity ?? 0) + 1;
        next[idx] = { ...cur, quantity: qty, line_total: round2(qty * cur.unit_price) };
        setCart(next);
      } else {
        setCart((prev) => [
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
      setCart((prev) => [
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

  return (
    <div className="p-4 md:p-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h1 className="text-3xl font-bold">Kassa</h1>
          <input
            className="border border-white/10 bg-white/[0.04] rounded px-3 py-2 w-64 outline-none focus:ring-2 focus:ring-teal-300/50 text-white/90 placeholder:text-slate-400"
            placeholder="Zoek product…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error && <p className="text-red-400 text-sm mb-3">Fout: {error}</p>}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addProduct(p)}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left transition 
                         hover:shadow-[0_0_0_1px_rgba(0,255,200,0.35),0_10px_30px_-10px_rgba(124,58,237,.25)]
                         hover:-translate-y-[1px] active:translate-y-[0px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium leading-tight break-words">{p.name}</div>
                {p.unit === "KILO" && (
                  <span className="shrink-0 whitespace-nowrap text-xs px-2 py-0.5 rounded-full border border-white/20">
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
      <div className="fixed bottom-0 inset-x-0 border-t border-white/10 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/50">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-lg relative">
            <span className="font-semibold">Totaal</span>{" "}
            <span className="relative inline-block after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent)]
                               after:translate-x-[-120%] after:animate-[shine_2.5s_ease_infinite]">
              € {total.toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => cart.length && setOpen(true)}
            disabled={cart.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-500 text-black font-semibold
                       disabled:opacity-50 hover:brightness-110 transition shadow-[0_0_20px_rgba(0,255,200,.35)]"
          >
            Bekijk bon
          </button>
        </div>
      </div>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-full sm:w-[440px]
                       bg-black/60 backdrop-blur-xl shadow-xl border-l border-white/10 flex flex-col"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Winkelmand</h2>
              <button onClick={() => setOpen(false)} className="text-sm opacity-70 hover:opacity-100">
                Sluiten ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="opacity-70 text-sm">Nog geen items.</p>
              ) : (
                <ul className="space-y-2">
                  {cart.map((ci) => (
                    <li key={ci.product_id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
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
                            className="px-2 py-1 border border-white/10 rounded bg-white/[0.02]"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={ci.quantity ?? 0}
                            onChange={(e) => updateQty(ci.product_id, Number(e.target.value || 0))}
                            className="w-20 border border-white/10 rounded px-2 py-1 bg-black/20"
                          />
                          <button
                            onClick={() => updateQty(ci.product_id, (ci.quantity ?? 0) + 1)}
                            className="px-2 py-1 border border-white/10 rounded bg-white/[0.02]"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-sm opacity-70">kg</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={ci.weight_kg ?? 0}
                            onChange={(e) => updateWeight(ci.product_id, Number(e.target.value || 0))}
                            className="w-24 border border-white/10 rounded px-2 py-1 bg-black/20"
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-white/10 space-y-3">
              <textarea
                placeholder="Opmerking (optioneel)…"
                className="w-full h-20 border border-white/10 rounded px-3 py-2 bg-black/20"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                onClick={checkout}
                disabled={saving || cart.length === 0}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-500 text-black font-semibold
                           disabled:opacity-50 hover:brightness-110 transition shadow-[0_0_20px_rgba(0,255,200,.35)]"
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
