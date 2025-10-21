"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  unit: "STUK" | "KILO";
  price: number | null;
  stock_quantity: number | null;
};

type ArchivedProduct = {
  id: string;
  name: string;
};

export default function PricesAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [archived, setArchived] = useState<ArchivedProduct[]>([]);
  const [newPrices, setNewPrices] = useState<Record<string, string>>({});
  const [newStock, setNewStock] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Nieuw: state voor toevoegen
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductStock, setNewProductStock] = useState("");

  // UI: tab voor actief/verborgen
  const [showArchived, setShowArchived] = useState<"active" | "archived">("active");

  async function loadProducts() {
    // Actieve (met unit toegevoegd!)
    const { data, error } = await supabase
        .from("products")
        .select("id,name,unit,stock_quantity")
        .eq("is_active", true)
        .order("name");

    if (error) {
      console.error("Supabase fout (prijzen laden):", error);
      setError(error.message);
    } else {
      // Haal ook de prijzen op
      const ids = (data ?? []).map((p) => (p as { id: string }).id);
      if (ids.length > 0) {
        const { data: pricesData } = await supabase
            .from("prices")
            .select("product_id,price")
            .in("product_id", ids)
            .order("valid_from", { ascending: false });

        const priceMap = new Map<string, number>();
        (pricesData ?? []).forEach((p) => {
          const pid = (p as { product_id: string }).product_id;
          const price = (p as { price: number }).price;
          if (!priceMap.has(pid)) priceMap.set(pid, price);
        });

        const combined = (data ?? []).map((p) => {
          const product = p as { id: string; name: string; unit: "STUK" | "KILO"; stock_quantity: number | null };
          return {
            ...product,
            price: priceMap.get(product.id) ?? null,
          };
        });
        setProducts(combined as Product[]);
      } else {
        setProducts([]);
      }
      setError(null);
    }

    // Verborgen
    const { data: hidden, error: hiddenErr } = await supabase
        .from("products")
        .select("id,name")
        .eq("is_active", false)
        .order("name");

    if (hiddenErr) {
      console.error("Supabase fout (verborgen laden):", hiddenErr);
      setError((prev) => prev ?? hiddenErr.message);
    } else {
      setArchived((hidden ?? []) as ArchivedProduct[]);
    }
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePrice(productId: string) {
    const value = newPrices[productId];
    if (!value) return;

    const numeric = Number(value.replace(",", "."));
    if (Number.isNaN(numeric)) {
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

  async function saveStock(productId: string) {
    const value = newStock[productId];
    if (!value) return;

    const numeric = Number(value);
    if (Number.isNaN(numeric) || numeric < 0) {
      alert("Voer een geldig aantal in");
      return;
    }

    setLoading(true);
    const { error } = await supabase
        .from("products")
        .update({ stock_quantity: numeric })
        .eq("id", productId);

    if (error) {
      console.error("Supabase fout (voorraad opslaan):", error);
      setError(error.message);
    } else {
      setNewStock((prev) => ({ ...prev, [productId]: "" }));
      await loadProducts();
    }
    setLoading(false);
  }

  async function addProduct() {
    const name = newProductName.trim();
    if (!name) {
      alert("Naam is verplicht");
      return;
    }

    const hasPrice = newProductPrice.trim().length > 0;
    const parsedPrice = hasPrice ? Number(newProductPrice.trim().replace(",", ".")) : null;

    const hasStock = newProductStock.trim().length > 0;
    const parsedStock = hasStock ? Number(newProductStock.trim()) : 0;

    if (hasPrice && (parsedPrice === null || Number.isNaN(parsedPrice))) {
      alert("Voer een geldige prijs in (bijv. 2.50)");
      return;
    }

    if (hasStock && (parsedStock === null || Number.isNaN(parsedStock) || parsedStock < 0)) {
      alert("Voer een geldige voorraad in");
      return;
    }

    setLoading(true);
    setError(null);

    const { data: inserted, error: insertErr } = await supabase
        .from("products")
        .insert([{ name, unit: "STUK", stock_quantity: parsedStock }])
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
            .update({ is_active: true, stock_quantity: parsedStock })
            .eq("id", (existingHidden as { id: string }).id)
            .select("id")
            .single();

        if (restoreErr) {
          console.error("Supabase fout (herstellen bij toevoegen):", restoreErr);
          setError(restoreErr.message);
          setLoading(false);
          return;
        }
        newId = (restored as { id: string }).id;
      } else {
        console.error("Supabase fout (product toevoegen):", insertErr);
        setError(insertErr.message);
        setLoading(false);
        return;
      }
    }

    if (newId && hasPrice && parsedPrice !== null) {
      const { error: priceErr } = await supabase.rpc("set_price", {
        _product_id: newId,
        _price: parsedPrice,
      });
      if (priceErr) {
        console.error("Supabase fout (prijs zetten na toevoegen):", priceErr);
        setError(priceErr.message);
      }
    }

    setNewProductName("");
    setNewProductPrice("");
    setNewProductStock("");
    await loadProducts();
    setLoading(false);
  }

  async function deleteProduct(id: string) {
    if (!id) return;

    const ok = confirm("Weet je zeker dat je dit product wilt verbergen (soft delete)?");
    if (!ok) return;

    setLoading(true);
    setError(null);

    const { error: delErr } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", id);

    if (delErr) {
      console.error("Supabase fout (product verbergen):", delErr);
      setError(delErr.message);
    } else {
      await loadProducts();
    }

    setLoading(false);
  }

  async function restoreProduct(id: string) {
    setLoading(true);
    setError(null);

    const { error: restoreErr } = await supabase
        .from("products")
        .update({ is_active: true })
        .eq("id", id);

    if (restoreErr) {
      console.error("Supabase fout (product herstellen):", restoreErr);
      setError(restoreErr.message);
    } else {
      await loadProducts();
    }
    setLoading(false);
  }

  return (
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Producten & Voorraad beheren</h1>

        {error && <p className="text-red-600 text-sm font-medium">Fout: {error}</p>}

        {/* Tabs */}
        <div className="flex gap-2">
          <button
              onClick={() => setShowArchived("active")}
              className={`px-3 py-1 rounded ${
                  showArchived === "active"
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-gray-200 text-slate-700"
              }`}
          >
            Actieve producten
          </button>
          <button
              onClick={() => setShowArchived("archived")}
              className={`px-3 py-1 rounded ${
                  showArchived === "archived"
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-gray-200 text-slate-700"
              }`}
          >
            Verborgen producten
          </button>
        </div>

        {/* Nieuw product */}
        {showArchived === "active" && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Nieuw product</h2>
              <div className="flex flex-wrap items-center gap-3">
                <input
                    className="border border-gray-300 rounded px-3 py-2 w-64 bg-white text-slate-900 placeholder:text-slate-400"
                    placeholder="Productnaam"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                />
                <input
                    className="border border-gray-300 rounded px-3 py-2 w-32 bg-white text-slate-900 placeholder:text-slate-400"
                    placeholder="Startprijs € (opt.)"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                />
                <input
                    className="border border-gray-300 rounded px-3 py-2 w-32 bg-white text-slate-900 placeholder:text-slate-400"
                    placeholder="Voorraad (opt.)"
                    type="number"
                    value={newProductStock}
                    onChange={(e) => setNewProductStock(e.target.value)}
                />
                <button
                    onClick={addProduct}
                    disabled={loading}
                    className="px-4 py-2 rounded bg-slate-900 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-sm"
                >
                  Toevoegen
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Je kunt prijs en voorraad leeg laten en later invullen.
              </p>
            </div>
        )}

        {/* Lijsten */}
        {showArchived === "active" ? (
            <div className="grid gap-3">
              {products.map((p) => (
                  <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="w-48 font-medium text-slate-900 flex items-center gap-2">
                      {p.name}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-300 bg-gray-50 text-slate-700">
                        {p.unit === "KILO" ? "KG" : "ST"}
                      </span>
                    </div>
                    
                    {/* Prijs sectie */}
                    <div className="flex items-center gap-2">
                      <div className="w-28 text-sm text-slate-600">
                        {p.price !== null ? `prijs: € ${p.price.toFixed(2)}` : "prijs: —"}
                      </div>
                      <input
                          className="border border-gray-300 rounded px-2 py-1 w-20 bg-white text-slate-900 placeholder:text-slate-400"
                          placeholder="€"
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
                          className="px-3 py-1 rounded bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition"
                      >
                        Prijs opslaan
                      </button>
                    </div>

                    {/* Voorraad sectie */}
                    <div className="flex items-center gap-2">
                      <div className="w-32 text-sm text-slate-600">
                        voorraad: {p.stock_quantity ?? 0} {p.unit === "KILO" ? "kg" : "st."}
                      </div>
                      <input
                          className="border border-gray-300 rounded px-2 py-1 w-20 bg-white text-slate-900 placeholder:text-slate-400"
                          placeholder={p.unit === "KILO" ? "kg" : "aantal"}
                          type="number"
                          step={p.unit === "KILO" ? "0.01" : "1"}
                          value={newStock[p.id] ?? ""}
                          onChange={(e) =>
                              setNewStock((prev) => ({
                                ...prev,
                                [p.id]: e.target.value,
                              }))
                          }
                      />
                      <button
                          onClick={() => saveStock(p.id)}
                          disabled={!newStock[p.id] || loading}
                          className="px-3 py-1 rounded bg-green-500 text-white text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition"
                      >
                        Voorraad opslaan
                      </button>
                    </div>

                    <div className="grow" />

                    <button
                        onClick={() => deleteProduct(p.id)}
                        disabled={loading}
                        className="px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 transition"
                        title="Verbergen (soft delete)"
                    >
                      Verwijder
                    </button>
                  </div>
              ))}
            </div>
        ) : (
            <div className="grid gap-3">
              {archived.length === 0 && (
                  <div className="text-slate-600 text-sm">Geen verborgen producten.</div>
              )}
              {archived.map((p) => (
                  <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="w-64 font-medium text-slate-900">{p.name}</div>
                    <div className="grow" />
                    <button
                        onClick={() => restoreProduct(p.id)}
                        disabled={loading}
                        className="px-3 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition"
                        title="Herstellen (weer actief maken)"
                    >
                      Herstellen
                    </button>
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}