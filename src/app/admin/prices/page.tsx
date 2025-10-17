"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  price: number | null;
};

export default function PricesAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [newPrices, setNewPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products_with_price")
      .select("id,name,price")
      .order("name");

    if (error) {
      console.error("Supabase fout (prijzen laden):", error);
      setError(error.message);
    } else {
      setProducts(data as Product[]);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function savePrice(productId: string) {
    const value = newPrices[productId];
    if (!value) return;

    const numeric = Number(value.replace(",", "."));
    if (isNaN(numeric)) {
      alert("Voer een geldig bedrag in");
      return;
    }

    setLoading(true);
    const { error } = await supabase.rpc("set_price", {
      _product_id: productId,
      _price: numeric,
    });

    if (error) {
      console.error("Supabase fout (prijs opslaan):", error);
      setError(error.message);
    } else {
      setNewPrices((prev) => ({ ...prev, [productId]: "" }));
      await loadProducts();
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-3xl font-bold text-slate-900">Dagprijzen beheren</h1>

      {error && <p className="text-red-600 text-sm font-medium">Fout: {error}</p>}

      <div className="grid gap-3">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="w-64 font-medium text-slate-900">{p.name}</div>
            <div className="w-28 text-sm text-slate-600">
              {p.price !== null ? `huidig: € ${p.price.toFixed(2)}` : "huidig: —"}
            </div>
            <input
              className="border border-gray-300 rounded px-2 py-1 w-24 bg-white text-slate-900 placeholder:text-slate-400"
              placeholder="Nieuwe €"
              value={newPrices[p.id] ?? ""}
              onChange={(e) =>
                setNewPrices((prev) => ({
                  ...prev,
                  [p.id]: e.target.value,
                }))
              }
            />
            <button
              onClick={() => savePrice(p.id)}
              disabled={!newPrices[p.id] || loading}
              className="px-3 py-1 rounded bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-sm"
            >
              Opslaan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}