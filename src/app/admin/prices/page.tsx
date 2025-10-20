"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  price: number | null;
};

type ArchivedProduct = {
  id: string;
  name: string;
};

export default function PricesAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [archived, setArchived] = useState<ArchivedProduct[]>([]);
  const [newPrices, setNewPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Nieuw: state voor toevoegen
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");

  // UI: tab voor actief/verborgen
  const [showArchived, setShowArchived] = useState<"active" | "archived">("active");

  async function loadProducts() {
    // Actieve (via view)
    const { data, error } = await supabase
        // TIP: deze view toont idealiter alleen actieve producten
        .from("products_with_price")
        .select("id,name,price")
        .order("name");

    if (error) {
      console.error("Supabase fout (prijzen laden):", error);
      setError(error.message);
    } else {
      setProducts((data ?? []) as Product[]);
      setError(null);
    }

    // Verborgen (rechtstreeks uit products)
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

  // Product toevoegen (met nette duplicate-afhandeling richting soft-deletes)
  async function addProduct() {
    const name = newProductName.trim();
    if (!name) {
      alert("Naam is verplicht");
      return;
    }

    const hasPrice = newProductPrice.trim().length > 0;
    const parsedPrice = hasPrice
        ? Number(newProductPrice.trim().replace(",", "."))
        : null;

    if (hasPrice && (parsedPrice === null || Number.isNaN(parsedPrice))) {
      alert("Voer een geldige prijs in (bijv. 2.50)");
      return;
    }

    setLoading(true);
    setError(null);

    // 1) Probeer gewoon te inserten
    const { data: inserted, error: insertErr } = await supabase
        .from("products")
        .insert([{ name, unit: "STUK" }]) // <-- unit verplicht invullen
        .select("id")
        .single();

    let newId: string | undefined = inserted?.id as string | undefined;

    // 2) Als dat faalt door duplicate op name (soft-deleted), herstel dan i.p.v. nieuw aan te maken
    if (insertErr) {
      // check of er een verborgen product met die naam bestaat
      const { data: existingHidden, error: checkErr } = await supabase
          .from("products")
          .select("id, is_active")
          .eq("name", name)
          .single();

      if (!checkErr && existingHidden && (existingHidden as { is_active: boolean }).is_active === false) {
        // herstel
        const { data: restored, error: restoreErr } = await supabase
            .from("products")
            .update({ is_active: true })
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

    // Optioneel direct prijs zetten via bestaande RPC
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
    await loadProducts();
    setLoading(false);
  }

  // Soft delete: markeer product als inactief i.p.v. hard delete
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

  // Herstellen uit verborgen
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
        <h1 className="text-3xl font-bold text-slate-900">Dagprijzen beheren</h1>

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
                <button
                    onClick={addProduct}
                    disabled={loading}
                    className="px-4 py-2 rounded bg-slate-900 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-sm"
                >
                  Toevoegen
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Je kunt de prijs leeg laten en later met “Opslaan” per product zetten.
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
                    <div className="w-64 font-medium text-slate-900">{p.name}</div>
                    <div className="w-36 text-sm text-slate-600">
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
