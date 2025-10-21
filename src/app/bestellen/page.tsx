"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  unit: "STUK" | "KILO";
  stock_quantity: number | null;
  price: number | null;
};

type StockLevel = "critical" | "low" | "medium" | "good";

export default function BestellenPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<StockLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drempelwaarden voor voorraad
  const CRITICAL_THRESHOLD = 5;  // Rood: minder dan 5
  const LOW_THRESHOLD = 15;      // Geel: minder dan 15
  const MEDIUM_THRESHOLD = 30;   // Oranje: minder dan 30

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    setError(null);

    try {
      const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id,name,unit,stock_quantity")
          .eq("is_active", true)
          .order("name");

      if (productsError) throw productsError;

      // Haal ook prijzen op
      const ids = (productsData ?? []).map((p) => (p as { id: string }).id);
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

        const combined = (productsData ?? []).map((p) => {
          const product = p as { id: string; name: string; unit: "STUK" | "KILO"; stock_quantity: number | null };
          return {
            ...product,
            price: priceMap.get(product.id) ?? null,
          };
        });

        setProducts(combined);
      } else {
        setProducts([]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Fout bij laden producten";
      setError(msg);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function getStockLevel(stock: number | null): StockLevel {
    if (stock === null || stock === 0) return "critical";
    if (stock < CRITICAL_THRESHOLD) return "critical";
    if (stock < LOW_THRESHOLD) return "low";
    if (stock < MEDIUM_THRESHOLD) return "medium";
    return "good";
  }

  function getStockColor(level: StockLevel): string {
    switch (level) {
      case "critical":
        return "bg-red-100 border-red-300 text-red-900";
      case "low":
        return "bg-yellow-100 border-yellow-300 text-yellow-900";
      case "medium":
        return "bg-orange-100 border-orange-300 text-orange-900";
      case "good":
        return "bg-green-100 border-green-300 text-green-900";
    }
  }

  function getStockBadge(level: StockLevel): { text: string; color: string } {
    switch (level) {
      case "critical":
        return { text: "OP!", color: "bg-red-500 text-white" };
      case "low":
        return { text: "Laag", color: "bg-yellow-500 text-white" };
      case "medium":
        return { text: "Matig", color: "bg-orange-500 text-white" };
      case "good":
        return { text: "Goed", color: "bg-green-500 text-white" };
    }
  }

  const filteredProducts = products.filter((p) => {
    // Filter op voorraad level
    if (filter !== "all") {
      const level = getStockLevel(p.stock_quantity);
      if (level !== filter) return false;
    }

    // Filter op zoekterm
    if (search) {
      return p.name.toLowerCase().includes(search.toLowerCase());
    }

    return true;
  });

  // Sorteer: critical eerst, dan low, medium, good
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const levelOrder: Record<StockLevel, number> = {
      critical: 0,
      low: 1,
      medium: 2,
      good: 3,
    };

    const levelA = getStockLevel(a.stock_quantity);
    const levelB = getStockLevel(b.stock_quantity);

    return levelOrder[levelA] - levelOrder[levelB];
  });

  const criticalCount = products.filter(p => getStockLevel(p.stock_quantity) === "critical").length;
  const lowCount = products.filter(p => getStockLevel(p.stock_quantity) === "low").length;
  const mediumCount = products.filter(p => getStockLevel(p.stock_quantity) === "medium").length;

  return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">Bestellen / Voorraad</h1>

          {error && <p className="text-red-600 text-sm mb-3 font-medium">Fout: {error}</p>}

          {/* Statistieken */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
              <div className="text-sm text-red-700 font-medium mb-1">Op / Bijna op</div>
              <div className="text-3xl font-bold text-red-900">{criticalCount}</div>
            </div>

            <div className="rounded-xl border-2 border-yellow-300 bg-yellow-50 p-4 shadow-sm">
              <div className="text-sm text-yellow-700 font-medium mb-1">Lage voorraad</div>
              <div className="text-3xl font-bold text-yellow-900">{lowCount}</div>
            </div>

            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 shadow-sm">
              <div className="text-sm text-orange-700 font-medium mb-1">Matige voorraad</div>
              <div className="text-3xl font-bold text-orange-900">{mediumCount}</div>
            </div>

            <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 shadow-sm">
              <div className="text-sm text-green-700 font-medium mb-1">Totaal producten</div>
              <div className="text-3xl font-bold text-green-900">{products.length}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek product..."
                  className="flex-1 min-w-[200px] border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
              />

              <div className="flex gap-2">
                <button
                    onClick={() => setFilter("all")}
                    className={`px-3 py-2 rounded text-sm font-medium transition ${
                        filter === "all"
                            ? "bg-slate-900 text-white"
                            : "bg-white border border-gray-300 text-slate-700 hover:bg-gray-50"
                    }`}
                >
                  Alles ({products.length})
                </button>
                <button
                    onClick={() => setFilter("critical")}
                    className={`px-3 py-2 rounded text-sm font-medium transition ${
                        filter === "critical"
                            ? "bg-red-500 text-white"
                            : "bg-white border border-red-300 text-red-700 hover:bg-red-50"
                    }`}
                >
                  Op ({criticalCount})
                </button>
                <button
                    onClick={() => setFilter("low")}
                    className={`px-3 py-2 rounded text-sm font-medium transition ${
                        filter === "low"
                            ? "bg-yellow-500 text-white"
                            : "bg-white border border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                    }`}
                >
                  Laag ({lowCount})
                </button>
                <button
                    onClick={() => setFilter("medium")}
                    className={`px-3 py-2 rounded text-sm font-medium transition ${
                        filter === "medium"
                            ? "bg-orange-500 text-white"
                            : "bg-white border border-orange-300 text-orange-700 hover:bg-orange-50"
                    }`}
                >
                  Matig ({mediumCount})
                </button>
              </div>
            </div>
          </div>

          {/* Producten lijst */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Producten overzicht ({sortedProducts.length})
            </h2>

            {loading ? (
                <p className="text-slate-600 text-sm">Laden...</p>
            ) : sortedProducts.length === 0 ? (
                <p className="text-slate-600 text-sm">Geen producten gevonden.</p>
            ) : (
                <div className="grid gap-3">
                  {sortedProducts.map((product) => {
                    const level = getStockLevel(product.stock_quantity);
                    const badge = getStockBadge(level);
                    const stock = product.stock_quantity ?? 0;

                    return (
                        <div
                            key={product.id}
                            className={`rounded-lg border-2 p-4 transition ${getStockColor(level)}`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <h3 className="font-bold text-lg">{product.name}</h3>
                                <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}>
                                  {badge.text}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full border border-gray-300 bg-white text-slate-700">
                                  {product.unit === "KILO" ? "Per KG" : "Per stuk"}
                                </span>
                              </div>

                              <div className="flex items-center gap-4 text-sm">
                                <div>
                                  <span className="text-slate-600">Voorraad: </span>
                                  <span className="font-bold text-slate-900">
                                    {stock} {product.unit === "KILO" ? "kg" : "st."}
                                  </span>
                                </div>

                                {product.price && (
                                    <div>
                                      <span className="text-slate-600">Prijs: </span>
                                      <span className="font-bold text-slate-900">
                                        € {product.price.toFixed(2)}
                                      </span>
                                    </div>
                                )}
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-32">
                              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${
                                        level === "critical"
                                            ? "bg-red-500"
                                            : level === "low"
                                                ? "bg-yellow-500"
                                                : level === "medium"
                                                    ? "bg-orange-500"
                                                    : "bg-green-500"
                                    }`}
                                    style={{
                                      width: `${Math.min(100, (stock / 50) * 100)}%`,
                                    }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                    );
                  })}
                </div>
            )}
          </div>

          {/* Legenda */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Legenda</h2>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500"></div>
                <span className="text-slate-700">
                  <strong>Rood:</strong> Op of minder dan {CRITICAL_THRESHOLD} stuks
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-500"></div>
                <span className="text-slate-700">
                  <strong>Geel:</strong> Minder dan {LOW_THRESHOLD} stuks
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500"></div>
                <span className="text-slate-700">
                  <strong>Oranje:</strong> Minder dan {MEDIUM_THRESHOLD} stuks
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500"></div>
                <span className="text-slate-700">
                  <strong>Groen:</strong> {MEDIUM_THRESHOLD}+ stuks
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}