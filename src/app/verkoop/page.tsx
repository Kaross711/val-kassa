"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Range = "today" | "thisWeek" | "thisMonth" | "all";

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

type PurchaseOrder = {
  created_at: string;
  total_amount: number;
};

type ProductStats = {
  product_name: string;
  total_quantity: number;
  total_revenue: number;
  unit: string;
};

export default function VerkoopPage() {
  const [range, setRange] = useState<Range>("today");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [daily, setDaily] = useState<DailySale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Totalen en statistieken
  const [totalSales, setTotalSales] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [avgTransactionValue, setAvgTransactionValue] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [dailyRevenue, setDailyRevenue] = useState<{date: string, revenue: number}[]>([]);

  function rangeStartISO(r: Range) {
    const now = new Date();
    
    if (r === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return start.toISOString();
    }
    
    if (r === "thisWeek") {
      // Maandag van deze week vanaf 00:00
      const start = new Date(now);
      const day = start.getDay(); // 0 = zondag, 1 = maandag, etc.
      const diff = day === 0 ? -6 : 1 - day; // Als zondag, ga 6 dagen terug, anders naar maandag
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    
    if (r === "thisMonth") {
      // Eerste dag van deze maand vanaf 00:00
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return start.toISOString();
    }
    
    return null; // all
  }

  function rangeEndISO(r: Range) {
    if (r === "today") {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return end.toISOString();
    }
    
    if (r === "thisWeek") {
      // Zondag van deze week tot 23:59:59
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 0 : 7 - day; // Als zondag, blijf, anders naar zondag
      const end = new Date(now);
      end.setDate(end.getDate() + diff);
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    }
    
    if (r === "thisMonth") {
      // Laatste dag van deze maand tot 23:59:59
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return end.toISOString();
    }
    
    return null;
  }

  function rangeStartDate(r: Range): string | null {
    const now = new Date();
    
    if (r === "today") {
      return now.toISOString().slice(0, 10);
    }
    
    if (r === "thisWeek") {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diff);
      return start.toISOString().slice(0, 10);
    }
    
    if (r === "thisMonth") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return start.toISOString().slice(0, 10);
    }
    
    return null; // all
  }

  function rangeEndDate(r: Range): string | null {
    const now = new Date();
    
    if (r === "today") {
      return now.toISOString().slice(0, 10);
    }
    
    if (r === "thisWeek") {
      const day = now.getDay();
      const diff = day === 0 ? 0 : 7 - day;
      const end = new Date(now);
      end.setDate(end.getDate() + diff);
      return end.toISOString().slice(0, 10);
    }
    
    if (r === "thisMonth") {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return end.toISOString().slice(0, 10);
    }
    
    return null;
  }

  async function loadReceipts(r: Range) {
    setLoading(true);
    setError(null);
    try {
      const start = rangeStartISO(r);
      const end = rangeEndISO(r);
      
      let q = supabase
          .from("receipts")
          .select("id,created_at,total_gross")
          .order("created_at", { ascending: false });
      
      if (start) q = q.gte("created_at", start);
      if (end) q = q.lte("created_at", end);
      
      const { data, error } = await q;
      if (error) throw error;
      
      const receiptData = (data ?? []) as Receipt[];
      setReceipts(receiptData);
      
      // Bereken totale verkoop
      const sales = receiptData.reduce((sum, r) => sum + (r.total_gross ?? 0), 0);
      setTotalSales(sales);
      
      // Bereken gemiddelde transactiewaarde
      setTransactionCount(receiptData.length);
      setAvgTransactionValue(receiptData.length > 0 ? sales / receiptData.length : 0);
      
      // Bereken dagelijkse omzet voor grafiek
      const dailyMap = new Map<string, number>();
      receiptData.forEach(receipt => {
        const date = receipt.created_at.slice(0, 10);
        dailyMap.set(date, (dailyMap.get(date) || 0) + receipt.total_gross);
      });
      
      const dailyData = Array.from(dailyMap.entries())
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      setDailyRevenue(dailyData);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Fout bij laden bonnen";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadDaily(r: Range) {
    const startDate = rangeStartDate(r);
    const endDate = rangeEndDate(r);
    
    let q = supabase
        .from("daily_sales")
        .select("*")
        .order("sales_date", { ascending: false });
    
    if (startDate) {
      q = q.gte("sales_date", startDate);
    }
    
    if (endDate) {
      q = q.lte("sales_date", endDate);
    }
    
    const { data, error } = await q;
    if (!error) {
      const dailyData = (data ?? []) as DailySale[];
      setDaily(dailyData);
      
      // Bereken product statistieken
      const productMap = new Map<string, ProductStats>();
      dailyData.forEach(d => {
        const existing = productMap.get(d.product_name);
        if (existing) {
          existing.total_quantity += d.total_amount;
          existing.total_revenue += d.total_revenue;
        } else {
          productMap.set(d.product_name, {
            product_name: d.product_name,
            total_quantity: d.total_amount,
            total_revenue: d.total_revenue,
            unit: d.unit
          });
        }
      });
      
      const stats = Array.from(productMap.values()).sort((a, b) => b.total_revenue - a.total_revenue);
      setProductStats(stats);
    }
  }

  async function loadPurchases(r: Range) {
    const start = rangeStartISO(r);
    const end = rangeEndISO(r);
    
    let q = supabase
        .from("purchase_orders")
        .select("created_at,total_amount");
    
    if (start) q = q.gte("created_at", start);
    if (end) q = q.lte("created_at", end);
    
    const { data, error } = await q;
    
    if (!error && data) {
      const purchases = (data as PurchaseOrder[]).reduce(
          (sum, p) => sum + (p.total_amount ?? 0),
          0
      );
      setTotalPurchases(purchases);
    } else {
      setTotalPurchases(0);
    }
  }

  useEffect(() => {
    loadReceipts(range);
    loadDaily(range);
    loadPurchases(range);
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

  const profit = totalSales - totalPurchases;
  const profitMargin = totalSales > 0 ? (profit / totalSales) * 100 : 0;

  return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-2 gap-3">
            <h1 className="text-3xl font-bold text-slate-900">Verkoop Dashboard</h1>
            <div className="flex items-center gap-2">
              {(["today", "thisWeek", "thisMonth", "all"] as const).map((k) => (
                  <button
                      key={k}
                      onClick={() => setRange(k)}
                      className={`px-3 py-1 rounded border text-sm ${
                          range === k
                              ? "bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold shadow-sm"
                              : "border-gray-300 bg-white hover:bg-gray-50 text-slate-700"
                      }`}
                  >
                    {k === "today" ? "Vandaag" : k === "thisWeek" ? "Deze Week" : k === "thisMonth" ? "Deze Maand" : "Alles"}
                  </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

        {/* Hoofd KPI's */}
        <section className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-green-50 to-green-100 p-4 shadow-sm">
              <div className="text-sm text-green-700 font-medium mb-1">Totale Omzet</div>
              <div className="text-2xl font-bold text-green-900">€ {totalSales.toFixed(2)}</div>
              <div className="text-xs text-green-600 mt-1">{transactionCount} transacties</div>
            </div>
            
            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-orange-50 to-orange-100 p-4 shadow-sm">
              <div className="text-sm text-orange-700 font-medium mb-1">Totale Inkoop</div>
              <div className="text-2xl font-bold text-orange-900">€ {totalPurchases.toFixed(2)}</div>
            </div>
            
            <div className={`rounded-xl border border-gray-200 p-4 shadow-sm ${
                profit >= 0 
                    ? "bg-gradient-to-br from-blue-50 to-blue-100" 
                    : "bg-gradient-to-br from-red-50 to-red-100"
            }`}>
              <div className={`text-sm font-medium mb-1 ${
                  profit >= 0 ? "text-blue-700" : "text-red-700"
              }`}>
                {profit >= 0 ? "Bruto Winst" : "Verlies"}
              </div>
              <div className={`text-2xl font-bold ${
                  profit >= 0 ? "text-blue-900" : "text-red-900"
              }`}>
                € {Math.abs(profit).toFixed(2)}
              </div>
              <div className={`text-xs mt-1 ${
                  profit >= 0 ? "text-blue-600" : "text-red-600"
              }`}>
                {profitMargin.toFixed(1)}% marge
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-purple-50 to-purple-100 p-4 shadow-sm">
              <div className="text-sm text-purple-700 font-medium mb-1">Gem. Bonwaarde</div>
              <div className="text-2xl font-bold text-purple-900">€ {avgTransactionValue.toFixed(2)}</div>
            </div>
          </div>
        </section>

        {/* Top Producten */}
        <section className="mx-auto max-w-7xl">
          <h2 className="text-xl font-semibold mb-2 text-slate-900">Top Producten</h2>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2 text-slate-900 font-semibold">Product</th>
                <th className="px-3 py-2 text-slate-900 font-semibold">Verkocht</th>
                <th className="px-3 py-2 text-slate-900 font-semibold">Omzet</th>
                <th className="px-3 py-2 text-slate-900 font-semibold">Gem. Prijs</th>
              </tr>
              </thead>
              <tbody>
              {productStats.slice(0, 10).map((p, i) => {
                const avgPrice = p.total_quantity > 0 ? p.total_revenue / p.total_quantity : 0;
                return (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-slate-900 font-medium">{p.product_name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {p.total_quantity.toFixed(2)} {p.unit}
                    </td>
                    <td className="px-3 py-2 text-green-700 font-semibold">€ {p.total_revenue.toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-700">€ {avgPrice.toFixed(2)}</td>
                  </tr>
                );
              })}
              {productStats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-600">
                      Geen data beschikbaar.
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Omzet grafiek */}
        <section className="mx-auto max-w-7xl">
          <h2 className="text-xl font-semibold mb-2 text-slate-900">Omzet per dag</h2>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {dailyRevenue.length > 0 ? (
              <div className="space-y-4">
                <div className="h-64 flex items-end justify-between gap-2">
                  {dailyRevenue.map((day, i) => {
                    const maxRevenue = Math.max(...dailyRevenue.map(d => d.revenue), 1);
                    const heightPercent = (day.revenue / maxRevenue) * 100;
                    const heightPx = (day.revenue / maxRevenue) * 200; // 200px max hoogte
                    
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group">
                        <div className="relative w-full mb-2">
                          {/* Tooltip */}
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                            € {day.revenue.toFixed(2)}
                          </div>
                          
                          {/* Balk */}
                          <div 
                            className="w-full bg-gradient-to-t from-green-600 via-green-500 to-green-400 rounded-t-lg hover:brightness-110 transition-all cursor-pointer shadow-sm"
                            style={{ 
                              height: `${Math.max(heightPx, 10)}px`,
                              minHeight: '10px'
                            }}
                          />
                        </div>
                        
                        {/* Datum label */}
                        <div className="text-xs text-slate-600 text-center w-full truncate px-1">
                          {new Date(day.date).toLocaleDateString('nl-NL', { 
                            day: 'numeric', 
                            month: 'short' 
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-sm text-slate-600">
                    Totaal over {dailyRevenue.length} {dailyRevenue.length === 1 ? 'dag' : 'dagen'}
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    € {dailyRevenue.reduce((sum, d) => sum + d.revenue, 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500">
                <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="font-medium">Geen omzetdata beschikbaar</p>
                <p className="text-sm mt-1">Voer verkopen in om data te zien</p>
              </div>
            )}
          </div>
        </section>

        {/* Dagoverzicht */}
        <section className="mx-auto max-w-7xl">
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

        {/* Bonnenlijst */}
        <section className="mx-auto max-w-7xl">
          <h2 className="text-xl font-semibold mb-2 text-slate-900">Alle verkopen</h2>
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
                          {dateStr} – {timeStr}
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

        {/* Detailvenster */}
        {selected && (
            <section className="mx-auto max-w-7xl">
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