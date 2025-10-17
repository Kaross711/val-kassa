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
      let q = supabase.from("receipts").select("id,created_at,total_gross").order("created_at", {
        ascending: false,
      });
      const start = rangeStartISO(r);
      if (start) q = q.gte("created_at", start);
      const { data, error } = await q;
      if (error) throw error;
      setReceipts((data ?? []) as Receipt[]);
    } catch (e: any) {
      setError(e.message ?? "Fout bij laden bonnen");
    } finally {
      setLoading(false);
    }
  }

  async function loadDaily(r: Range) {
    const start = rangeStartISO(r);
    let q = supabase.from("daily_sales").select("*").order("sales_date", { ascending: false });
    if (start) q = q.gte("sales_date", start.slice(0, 10)); // YYYY-MM-DD
    const { data, error } = await q;
    if (!error) setDaily((data ?? []) as DailySale[]);
  }

  useEffect(() => {
    loadReceipts(range);
    loadDaily(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <h1 className="text-3xl font-bold">Verkoop</h1>
          <div className="flex items-center gap-2">
            {(["all", "today", "week"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`px-3 py-1 rounded border ${
                  range === k
                    ? "bg-gradient-to-r from-teal-400 via-cyan-400 to-violet-500 text-black font-semibold"
                    : "border-white/20 bg-white/[0.02] hover:bg-white/[0.06]"
                }`}
              >
                {k === "all" ? "Alles" : k === "today" ? "Vandaag" : "7 dagen"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* 1️⃣ Dagoverzicht */}
      <section className="mx-auto max-w-6xl">
        <h2 className="text-xl font-semibold mb-2">Verkocht per dag</h2>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-white/[0.03] text-left">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Hoeveelheid</th>
                <th className="px-3 py-2">Omzet (€)</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="px-3 py-1">{d.sales_date}</td>
                  <td className="px-3 py-1">{d.product_name}</td>
                  <td className="px-3 py-1">
                    {d.total_amount.toFixed(2)} {d.unit}
                  </td>
                  <td className="px-3 py-1">€ {d.total_revenue.toFixed(2)}</td>
                </tr>
              ))}
              {daily.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center opacity-70">
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
        <h2 className="text-xl font-semibold mb-2">Alle aankopen</h2>
        {loading ? (
          <p className="opacity-70 text-sm">Laden…</p>
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
                      ? "border-teal-300/60"
                      : "border-white/10 hover:shadow-[0_0_0_1px_rgba(0,255,200,0.35),0_10px_30px_-10px_rgba(124,58,237,.25)]"
                  } bg-white/[0.02]`}
                >
                  <div className="font-semibold">
                    {dateStr} – {timeStr}
                  </div>
                  <div className="text-sm opacity-70">€ {r.total_gross?.toFixed(2) ?? "0.00"}</div>
                </button>
              );
            })}
            {receipts.length === 0 && (
              <p className="opacity-70 text-sm">Geen bonnen in deze periode.</p>
            )}
          </div>
        )}
      </section>

      {/* 3️⃣ Detailvenster */}
      {selected && (
        <section className="mx-auto max-w-6xl">
          <h2 className="text-xl font-semibold mb-2">
            Bon-details
            <button onClick={() => setSelected(null)} className="ml-3 text-sm text-teal-300 hover:text-white">
              sluiten
            </button>
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-white/[0.03] text-left">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Hoeveelheid</th>
                  <th className="px-3 py-2">Prijs (€)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={idx} className="border-t border-white/10">
                    <td className="px-3 py-1">{i.product_name}</td>
                    <td className="px-3 py-1">
                      {i.unit === "KILO" ? `${i.weight_kg?.toFixed(2)} kg` : `${i.quantity} st.`}
                    </td>
                    <td className="px-3 py-1">€ {i.line_total.toFixed(2)}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center opacity-70">
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
