"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const WACHTWOORD = "valkassa123"; // Hardcoded wachtwoord

type SaleType = "WINKEL" | "BESTELLING" | "BEDRIJF";

type SaleData = {
  total: number;
  count: number;
};

export default function WinstPage() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // Kosten
  const [huur, setHuur] = useState<number>(1200);
  const [auto, setAuto] = useState<number>(450);
  const [personeel, setPersoneel] = useState<number>(2500);
  const [overig, setOverig] = useState<number>(300);

  // Verkopen data
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [salesByType, setSalesByType] = useState<Record<SaleType, SaleData>>({
    WINKEL: { total: 0, count: 0 },
    BESTELLING: { total: 0, count: 0 },
    BEDRIJF: { total: 0, count: 0 },
  });
  const [totaleInkoop, setTotaleInkoop] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Initialiseer met huidige maand
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${year}-${month}`);
  }, []);

  // Laad verkopen wanneer maand verandert
  useEffect(() => {
    if (isUnlocked && selectedMonth) {
      loadSales();
    }
  }, [isUnlocked, selectedMonth]);

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordInput === WACHTWOORD) {
      setIsUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  }

  async function loadSales() {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split("-");
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);

      // Haal alle verkopen op voor de geselecteerde maand uit receipts tabel
      const { data: receipts, error } = await supabase
        .from("receipts")
        .select("id, sale_type, total_gross, created_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (error) {
        console.error("Error loading sales:", error);
        return;
      }

      if (!receipts || receipts.length === 0) {
        setSalesByType({
          WINKEL: { total: 0, count: 0 },
          BESTELLING: { total: 0, count: 0 },
          BEDRIJF: { total: 0, count: 0 },
        });
        setLoading(false);
        return;
      }

      // Bereken totalen per type
      const totals: Record<SaleType, SaleData> = {
        WINKEL: { total: 0, count: 0 },
        BESTELLING: { total: 0, count: 0 },
        BEDRIJF: { total: 0, count: 0 },
      };

      receipts.forEach((receipt) => {
        const saleType = (receipt.sale_type || "WINKEL") as SaleType;
        totals[saleType].total += receipt.total_gross || 0;
        totals[saleType].count += 1;
      });

      setSalesByType(totals);

      // Haal ook de inkopen op voor dezelfde periode
      const { data: purchases, error: purchasesError } = await supabase
        .from("purchase_orders")
        .select("total_amount")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (purchasesError) {
        console.error("Error loading purchases:", purchasesError);
      } else {
        const inkoopTotal = (purchases || []).reduce(
          (sum, p) => sum + (p.total_amount || 0),
          0
        );
        setTotaleInkoop(inkoopTotal);
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Berekeningen
  const totaleKosten = huur + auto + personeel + overig;
  const totaleOmzet =
    salesByType.WINKEL.total +
    salesByType.BESTELLING.total +
    salesByType.BEDRIJF.total;
  const nettoWinst = totaleOmzet - totaleKosten - totaleInkoop;

  // Wachtwoord scherm
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-slate-900">Beveiligde Pagina</h1>
            <p className="text-slate-600 mt-2">Voer wachtwoord in om verder te gaan</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError(false);
                }}
                placeholder="Wachtwoord"
                className={`w-full px-4 py-3 rounded-lg border-2 ${
                  passwordError
                    ? "border-red-500 focus:border-red-500"
                    : "border-gray-300 focus:border-blue-500"
                } focus:outline-none focus:ring-4 ${
                  passwordError ? "focus:ring-red-200" : "focus:ring-blue-200"
                } transition`}
                autoFocus
              />
              {passwordError && (
                <p className="text-red-600 text-sm mt-2">❌ Onjuist wachtwoord</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-bold hover:brightness-110 transition shadow-lg"
            >
              Ontgrendelen
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Hoofd pagina (na inloggen)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Winstoverzicht
          </h1>
          <p className="mt-2 text-slate-600">
            Bekijk je netto winst na alle kosten
          </p>
        </div>
        <button
          onClick={() => setIsUnlocked(false)}
          className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 hover:bg-gray-50 transition text-sm"
        >
          🔒 Vergrendelen
        </button>
      </div>

      {/* Maand selectie */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Selecteer Maand
        </label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Verkopen overzicht */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          💰 Verkopen
          {loading && <span className="text-sm text-slate-500">(laden...)</span>}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-slate-600 mb-1">Winkelverkoop</p>
            <p className="text-2xl font-bold text-blue-600">
              €{salesByType.WINKEL.total.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {salesByType.WINKEL.count} verkopen
            </p>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-sm text-slate-600 mb-1">Bestellingen</p>
            <p className="text-2xl font-bold text-orange-600">
              €{salesByType.BESTELLING.total.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {salesByType.BESTELLING.count} bestellingen
            </p>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-slate-600 mb-1">Bedrijfsverkoop</p>
            <p className="text-2xl font-bold text-green-600">
              €{salesByType.BEDRIJF.total.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {salesByType.BEDRIJF.count} verkopen
            </p>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-400">
          <p className="text-sm text-slate-600 mb-1">Totale Omzet</p>
          <p className="text-3xl font-bold text-green-700">
            €{totaleOmzet.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Kosten */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          📊 Vaste Kosten per Maand
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Huur (€)
            </label>
            <input
              type="number"
              value={huur}
              onChange={(e) => setHuur(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Auto (€)
            </label>
            <input
              type="number"
              value={auto}
              onChange={(e) => setAuto(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Personeelskosten (€)
            </label>
            <input
              type="number"
              value={personeel}
              onChange={(e) => setPersoneel(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Overige Kosten (€)
            </label>
            <input
              type="number"
              value={overig}
              onChange={(e) => setOverig(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        </div>

        <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-sm font-medium text-orange-900">
            Totale Kosten: <span className="text-lg">€{totaleKosten.toFixed(2)}</span> per maand
          </p>
        </div>
      </div>

      {/* Winst berekening */}
      <div className="rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-slate-50 to-gray-100 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">
          🎯 Winstberekening
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
            <span className="text-slate-700 font-medium">Totale Omzet</span>
            <span className="text-xl font-bold text-green-600">
              €{totaleOmzet.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-center text-2xl text-slate-400">−</div>

          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
            <span className="text-slate-700 font-medium">Vaste Kosten</span>
            <span className="text-xl font-bold text-orange-600">
              €{totaleKosten.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-center text-2xl text-slate-400">−</div>

          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
            <span className="text-slate-700 font-medium">Inkoop Kosten</span>
            <span className="text-xl font-bold text-red-600">
              €{totaleInkoop.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-center text-2xl text-slate-400">=</div>

          <div
            className={`p-6 rounded-xl border-2 ${
              nettoWinst >= 0
                ? "bg-gradient-to-br from-green-100 to-emerald-100 border-green-400"
                : "bg-gradient-to-br from-red-100 to-rose-100 border-red-400"
            }`}
          >
            <p className="text-sm text-slate-600 mb-2">
              {nettoWinst >= 0 ? "✅ Netto Winst" : "❌ Netto Verlies"}
            </p>
            <p
              className={`text-4xl font-bold ${
                nettoWinst >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              €{Math.abs(nettoWinst).toFixed(2)}
            </p>
            {nettoWinst >= 0 ? (
              <p className="text-xs text-green-700 mt-2">
                Goede maand! Je hebt winst gemaakt 🎉
              </p>
            ) : (
              <p className="text-xs text-red-700 mt-2">
                Let op: Je kosten + inkoop zijn hoger dan je omzet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Extra statistieken */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-slate-600 mb-1">Winstmarge</p>
          <p className="text-2xl font-bold text-slate-900">
            {totaleOmzet > 0 ? ((nettoWinst / totaleOmzet) * 100).toFixed(1) : 0}%
          </p>
        </div>

        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-slate-600 mb-1">Vaste Kosten/Omzet</p>
          <p className="text-2xl font-bold text-slate-900">
            {totaleOmzet > 0 ? ((totaleKosten / totaleOmzet) * 100).toFixed(1) : 0}%
          </p>
        </div>

        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-slate-600 mb-1">Inkoop/Omzet</p>
          <p className="text-2xl font-bold text-slate-900">
            {totaleOmzet > 0 ? ((totaleInkoop / totaleOmzet) * 100).toFixed(1) : 0}%
          </p>
        </div>

        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-slate-600 mb-1">Totaal Verkopen</p>
          <p className="text-2xl font-bold text-slate-900">
            {salesByType.WINKEL.count +
              salesByType.BESTELLING.count +
              salesByType.BEDRIJF.count}
          </p>
        </div>
      </div>
    </div>
  );
}
