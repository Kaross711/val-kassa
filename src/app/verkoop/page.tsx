"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Range = "all" | "today" | "week";

type Receipt = {
  id: string;
  created_at: string;
  total_gross: number;
};

type ReceiptItem = {
  product_name: string;
  unit: "STUK" | "KILO";
  quantity: number | null;
  weight_kg: number | null;
  line_total: number;
};

type DailySale = {
  sales_date: string;
  product_name: string;
  unit: "STUK" | "KILO";
  total_amount: number;
  total_revenue: number;
};

export default function VerkoopPage() {
  const [range, setRange] = useState<Range>("all");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [daily, setDaily] = useState<DailySale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function rangeStartISO(r: Range) {
    const now = new Date();
    if (r === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.toISOString();
    }
    if (r === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return start.toISOString();
    }
    return null;
  }

  async function loadReceipts(r: Range) {
    setLoading(true);
    setError(null);
    try {
      const start = rangeStartISO(r);
      let q = supabase.from("receipts").select("id,created_at,total_gross").order("created_at", { ascending: false });
      if (start) q = q.gte("created_at", start);
      const { data, error } = await q;
      if (error) throw error;
      setReceipts((data ?? []) as Receipt[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Fout bij laden bonnen";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadDaily(r: Range) {
    const start = rangeStartISO(r);
    let q = supabase.from("daily_sales").select("*").order("sales_date", { ascending: false });
    if (start) q = q.gte("sales_date", start.slice(0, 10));
    const { data, error } = await q;
    if (!error) setDaily((data ?? []) as DailySale[]);
  }

  useEffect(() => {
    loadReceipts(range);
    loadDaily(range);
  }, [range]);

  async function loadItems(receiptId: string) {
    setSelected(receiptId);
    const { data, error } = await supabase
        .from("receipt_items_view")
        .select("product_name,unit,quantity,weight_kg,line_total")
        .eq("receipt_id", receiptId);
    if (error) setError(error.message);
    else setItems(data as ReceiptItem[]);
  }

  return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-2 gap-3">
            <h1 className="text-3xl font-bold text-slate-900">Verkoop</h1>
            <div className="flex items-center gap-2">
              {(["all", "today", "week"] as const).map((k) => (
                  <button
                      key={k}
                      onClick={() => setRange(k)}
                      className={`px-3 py-1 rounded border ${
                          range === k
                              ? "bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold shadow-sm"
                              : "border-gray-300 bg-white hover:bg-gray-50 text-slate-700"
                      }`}
                  >
                    {k === "all" ? "Alles" : k === "today" ? "Vandaag" : "7 dagen"}
                  </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

        {/* 1️⃣ Dagoverzicht */}
        <section className="mx-auto max-w-6xl">
          <h2 className="text-xl font-semibold mb-2 text-slate-900">Verkocht per dag</h2>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2 text-slate-900 font-semibold">Datum</th>
                <th className="px-3 py-2 text-slate-900 font-semibold">Product</th>
                <th className="px-3 py-2 text-slate-900 font-semibold">Hoeveelheid</th>
                <th className="px-3 py-2 text-slate-900 font-semibold">Omzet (€)</th>
              </tr>
              </thead>
              <tbody>
              {daily.map((d, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-3 py-1 text-slate-700">{d.sales_date}</td>
                    <td className="px-3 py-1 text-slate-700">{d.product_name}</td>
                    <td className="px-3 py-1 text-slate-700">
                      {d.total_amount.toFixed(2)} {d.unit}
                    </td>
                    <td className="px-3 py-1 text-slate-900 font-medium">€ {d.total_revenue.toFixed(2)}</td>
                  </tr>
              ))}
              {daily.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-600">
                      Geen resultaten voor deze periode.
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 2️⃣ Bonnenlijst */}
        <section className="mx-auto max-w-6xl">
          <h2 className="text-xl font-semibold mb-2 text-slate-900">Alle aankopen</h2>
          {loading ? (
              <p className="text-slate-600 text-sm">Laden…</p>
          ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {receipts.map((r) => {
                  const date = new Date(r.created_at);
                  const dateStr = date.toLocaleDateString("nl-NL", {
                    day: "2-digit",
                    month: "short",
                  });
                  const timeStr = date.toLocaleTimeString("nl-NL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                      <button
                          key={r.id}
                          onClick={() => loadItems(r.id)}
                          className={`rounded-xl p-3 text-left transition border ${
                              selected === r.id
                                  ? "border-green-400 bg-green-50 shadow-md"
                                  : "border-gray-200 hover:border-green-300 hover:shadow-md bg-white"
                          }`}
                      >
                        <div className="font-semibold text-slate-900">
                          {dateStr} — {timeStr}
                        </div>
                        <div className="text-sm text-slate-600">€ {r.total_gross?.toFixed(2) ?? "0.00"}</div>
                      </button>
                  );
                })}
                {receipts.length === 0 && (
                    <p className="text-slate-600 text-sm">Geen bonnen in deze periode.</p>
                )}
              </div>
          )}
        </section>

        {/* 3️⃣ Detailvenster */}
        {selected && (
            <section className="mx-auto max-w-6xl">
              <h2 className="text-xl font-semibold mb-2 text-slate-900">
                Bon-details
                <button onClick={() => setSelected(null)} className="ml-3 text-sm text-green-600 hover:text-green-700 font-medium">
                  sluiten
                </button>
              </h2>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2 text-slate-900 font-semibold">Product</th>
                    <th className="px-3 py-2 text-slate-900 font-semibold">Hoeveelheid</th>
                    <th className="px-3 py-2 text-slate-900 font-semibold">Prijs (€)</th>
                  </tr>
                  </thead>
                  <tbody>
                  {items.map((i, idx) => (
                      <tr key={idx} className="border-t border-gray-200">
                        <td className="px-3 py-1 text-slate-700">{i.product_name}</td>
                        <td className="px-3 py-1 text-slate-700">
                          {i.unit === "KILO" ? `${i.weight_kg?.toFixed(2)} kg` : `${i.quantity} st.`}
                        </td>
                        <td className="px-3 py-1 text-slate-900 font-medium">€ {i.line_total.toFixed(2)}</td>
                      </tr>
                  ))}
                  {items.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-slate-600">
                          Geen regels voor deze bon.
                        </td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </section>
        )}
      </div>
  );
}