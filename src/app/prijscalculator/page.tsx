"use client";

import { useState, useEffect } from "react";

// Types voor onze data structuur
interface FixedCosts {
  rent: number;
  vehicle: number;
  staff: number;
  other: number;
}

interface ProductData {
  purchase_cost: number;
  vat_rate: number;
  shrink_rate: number;
  profit_margin_pct: number;
  labor_minutes_per_unit: number;
}

interface StoredData {
  version: number;
  fixed_costs: FixedCosts;
  product: ProductData;
  total_purchase: number;
  work_days: number;
}

// Defaults
const DEFAULT_FIXED_COSTS: FixedCosts = {
  rent: 1400,
  vehicle: 850,
  staff: 2000,
  other: 500,
};

const DEFAULT_PRODUCT: ProductData = {
  purchase_cost: 0,
  vat_rate: 0.09, // 9% BTW
  shrink_rate: 0.07, // 7% derving
  profit_margin_pct: 0.30, // 30% winst
  labor_minutes_per_unit: 0.5,
};

const CURRENT_VERSION = 1;
const STORAGE_KEY = "prijscalculator_data";

export default function PrijsCalculatorPage() {
  // State
  const [fixedCosts, setFixedCosts] = useState<FixedCosts>(DEFAULT_FIXED_COSTS);
  const [product, setProduct] = useState<ProductData>(DEFAULT_PRODUCT);
  const [totalPurchase, setTotalPurchase] = useState<number>(8000);
  const [workDays, setWorkDays] = useState<number>(26);

  // Load data from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data: StoredData = JSON.parse(stored);

        // Versie check (voor toekomstige migraties)
        if (data.version === CURRENT_VERSION) {
          setFixedCosts(data.fixed_costs || DEFAULT_FIXED_COSTS);
          setProduct(data.product || DEFAULT_PRODUCT);
          setTotalPurchase(data.total_purchase || 8000);
          setWorkDays(data.work_days || 26);
        }
      } catch (e) {
        console.error("Fout bij laden data:", e);
      }
    }
  }, []);

  // Auto-save functie
  const saveToStorage = (
    costs: FixedCosts,
    prod: ProductData,
    purchase: number,
    days: number
  ) => {
    const data: StoredData = {
      version: CURRENT_VERSION,
      fixed_costs: costs,
      product: prod,
      total_purchase: purchase,
      work_days: days,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  // Update handlers met auto-save
  const updateFixedCost = (field: keyof FixedCosts, value: number) => {
    const newCosts = { ...fixedCosts, [field]: value };
    setFixedCosts(newCosts);
    saveToStorage(newCosts, product, totalPurchase, workDays);
  };

  const updateProduct = (field: keyof ProductData, value: number) => {
    const newProduct = { ...product, [field]: value };
    setProduct(newProduct);
    saveToStorage(fixedCosts, newProduct, totalPurchase, workDays);
  };

  const updateTotalPurchase = (value: number) => {
    setTotalPurchase(value);
    saveToStorage(fixedCosts, product, value, workDays);
  };

  const updateWorkDays = (value: number) => {
    setWorkDays(value);
    saveToStorage(fixedCosts, product, totalPurchase, value);
  };

  // Reset functie
  const resetAll = () => {
    if (confirm("Weet je zeker dat je alles wilt resetten naar de standaard waarden?")) {
      localStorage.removeItem(STORAGE_KEY);
      setFixedCosts(DEFAULT_FIXED_COSTS);
      setProduct(DEFAULT_PRODUCT);
      setTotalPurchase(8000);
      setWorkDays(26);
    }
  };

  // Centrale berekeningen
  const calculations = {
    totalFixedCosts: fixedCosts.rent + fixedCosts.vehicle + fixedCosts.staff + fixedCosts.other,
    get breakEvenPerDay() {
      return this.totalFixedCosts / workDays;
    },
    get costMarkupPercentage() {
      return (this.totalFixedCosts / totalPurchase) * 100;
    },
    get costWithShrinkage() {
      return product.purchase_cost / (1 - product.shrink_rate);
    },
    get costPrice() {
      return this.costWithShrinkage * (1 + this.costMarkupPercentage / 100);
    },
    get sellingPriceExclVAT() {
      return this.costPrice * (1 + product.profit_margin_pct);
    },
    get sellingPriceInclVAT() {
      return this.sellingPriceExclVAT * (1 + product.vat_rate);
    },
    get profitPerUnit() {
      return this.sellingPriceExclVAT - this.costPrice;
    },
    get totalMarginPercentage() {
      if (product.purchase_cost === 0) return 0;
      return ((this.sellingPriceExclVAT - product.purchase_cost) / product.purchase_cost) * 100;
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Prijscalculator
          </h1>
          <p className="mt-2 text-slate-600">
            Bereken je kostprijs en verkoopprijs op basis van al je bedrijfskosten
          </p>
        </div>
        <button
          onClick={resetAll}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          Reset naar standaard
        </button>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Hoe werkt dit?</h3>
        <p className="text-sm text-blue-800">
          <strong>Kostenopslag</strong> is het percentage dat je moet toevoegen aan je inkoopprijs om je vaste bedrijfskosten te dekken.
          Dit is <strong className="text-red-600">GEEN winst</strong> - pas daarna komt je <strong className="text-green-600">winstmarge</strong>!
        </p>
        <p className="text-sm text-blue-900 mt-2 font-medium">
          📌 Systeem: Inkoop + Derving + Kostenopslag = Kostprijs + Winstmarge = Verkoopprijs (excl.) + BTW = Verkoopprijs (incl.)
        </p>
        <p className="text-xs text-blue-700 mt-2">
          ✅ Alle wijzigingen worden automatisch opgeslagen
        </p>
      </div>

      {/* Stap 1: Vaste Kosten */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          1️⃣ Vaste Kosten per Maand
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Huur (€)
            </label>
            <input
              type="number"
              value={fixedCosts.rent}
              onChange={(e) => updateFixedCost("rent", e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Auto/Transport (€)
            </label>
            <input
              type="number"
              value={fixedCosts.vehicle}
              onChange={(e) => updateFixedCost("vehicle", e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Personeelskosten (€)
            </label>
            <input
              type="number"
              value={fixedCosts.staff}
              onChange={(e) => updateFixedCost("staff", e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Overige Kosten (€)
            </label>
            <input
              type="number"
              value={fixedCosts.other}
              onChange={(e) => updateFixedCost("other", e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>
        </div>
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm font-medium text-green-900">
            Totale Vaste Kosten: <span className="text-lg">€{calculations.totalFixedCosts.toFixed(2)}</span> per maand
          </p>
        </div>
      </div>

      {/* Stap 2: Inkoop & Werkdagen */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          2️⃣ Inkoop & Werkdagen
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Totale Inkoop per Maand (€)
            </label>
            <input
              type="number"
              value={totalPurchase}
              onChange={(e) => updateTotalPurchase(e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Aantal Werkdagen per Maand
            </label>
            <input
              type="number"
              value={workDays}
              onChange={(e) => updateWorkDays(e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        </div>
      </div>

      {/* Break-even Resultaten */}
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          📊 Break-even Analyse
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-lg border border-orange-200">
            <p className="text-sm text-slate-600">Minimaal per Dag</p>
            <p className="text-2xl font-bold text-orange-600">
              €{calculations.breakEvenPerDay.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Dit moet je minimaal per dag verdienen
            </p>
          </div>
          <div className="p-4 bg-white rounded-lg border border-orange-200">
            <p className="text-sm text-slate-600">Kostenopslag</p>
            <p className="text-2xl font-bold text-orange-600">
              {calculations.costMarkupPercentage.toFixed(2)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Minimale opslag op inkoop om kosten te dekken
            </p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-orange-100 rounded-lg border border-orange-300">
          <p className="text-sm font-medium text-orange-900">
            ⚠️ Verkoop je onder {calculations.costMarkupPercentage.toFixed(2)}% opslag → je draait verlies
          </p>
        </div>
      </div>

      {/* Stap 3: Product Berekening */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          3️⃣ Bereken Verkoopprijs per Product
        </h2>

        <div className="space-y-4">
          {/* Inkoopprijs */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Inkoopprijs (€ per kg/stuk)
            </label>
            <input
              type="number"
              step="0.01"
              value={product.purchase_cost}
              onChange={(e) => updateProduct("purchase_cost", e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* BTW percentage */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              BTW Percentage
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateProduct("vat_rate", 0.09)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  product.vat_rate === 0.09
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-blue-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Laag tarief</p>
                <p className="text-xl font-bold text-blue-600">9%</p>
                <p className="text-xs text-slate-600 mt-1">Groente/Fruit</p>
              </button>
              <button
                onClick={() => updateProduct("vat_rate", 0.21)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  product.vat_rate === 0.21
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-blue-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Hoog tarief</p>
                <p className="text-xl font-bold text-blue-600">21%</p>
                <p className="text-xs text-slate-600 mt-1">Overige</p>
              </button>
            </div>
          </div>

          {/* Derving percentage */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Derving/Krimp Percentage
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={product.shrink_rate}
              onChange={(e) => updateProduct("shrink_rate", e.target.value === "" ? 0 : Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="bijv. 0.07 voor 7%"
            />
            <p className="text-xs text-slate-500 mt-1">
              Percentage dat bederft/weggegooid wordt (bijv. 0.07 = 7%)
            </p>
          </div>

          {/* Arbeidskosten */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Arbeidsminuten per Eenheid
            </label>
            <input
              type="number"
              step="0.1"
              value={product.labor_minutes_per_unit}
              onChange={(e) => updateProduct("labor_minutes_per_unit", e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0.0"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="text-xs text-slate-500 mt-1">
              Hoeveel minuten werk per product (sorteren, verpakken, etc.)
            </p>
          </div>

          {/* Winstmarge */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Kies je Winstmarge
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => updateProduct("profit_margin_pct", 0.30)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  product.profit_margin_pct === 0.30
                    ? "border-green-500 bg-green-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-green-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Standaard</p>
                <p className="text-2xl font-bold text-green-600">30%</p>
                <p className="text-xs text-slate-600 mt-1">Basis producten</p>
              </button>

              <button
                onClick={() => updateProduct("profit_margin_pct", 0.40)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  product.profit_margin_pct === 0.40
                    ? "border-orange-500 bg-orange-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-orange-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Middel</p>
                <p className="text-2xl font-bold text-orange-600">40%</p>
                <p className="text-xs text-slate-600 mt-1">Normaal fruit</p>
              </button>

              <button
                onClick={() => updateProduct("profit_margin_pct", 0.60)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  product.profit_margin_pct === 0.60
                    ? "border-purple-500 bg-purple-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-purple-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Groot</p>
                <p className="text-2xl font-bold text-purple-600">60%</p>
                <p className="text-xs text-slate-600 mt-1">Luxe/Exoten</p>
              </button>
            </div>
          </div>
        </div>

        {/* Berekening Stappen */}
        <div className="mt-6 space-y-3">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-slate-600">Stap 1: Inkoopprijs</p>
            <p className="text-xl font-bold text-blue-600">€{product.purchase_cost.toFixed(2)}</p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">+</span>
          </div>

          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm text-slate-600">
              Stap 2: Derving ({(product.shrink_rate * 100).toFixed(0)}%)
            </p>
            <p className="text-xl font-bold text-yellow-600">
              €{(calculations.costWithShrinkage - product.purchase_cost).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Gecorrigeerd voor krimp: €{calculations.costWithShrinkage.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">+</span>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-sm text-slate-600">
              Stap 3: Kostenopslag ({calculations.costMarkupPercentage.toFixed(2)}%)
            </p>
            <p className="text-xl font-bold text-orange-600">
              €{(calculations.costWithShrinkage * (calculations.costMarkupPercentage / 100)).toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">=</span>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-slate-600">Kostprijs (zonder winst)</p>
            <p className="text-xl font-bold text-purple-600">€{calculations.costPrice.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">
              ⚠️ Verkoop hieronder = verlies
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">+</span>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-slate-600">
              Stap 4: Winstopslag ({(product.profit_margin_pct * 100).toFixed(0)}%)
            </p>
            <p className="text-xl font-bold text-green-600">
              €{calculations.profitPerUnit.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">=</span>
          </div>

          <div className="p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg border border-green-400">
            <p className="text-sm text-slate-600">Verkoopprijs (excl. BTW)</p>
            <p className="text-3xl font-bold text-green-700">€{calculations.sellingPriceExclVAT.toFixed(2)}</p>
            <p className="text-xs text-slate-600 mt-2">
              Pure winst per stuk: €{calculations.profitPerUnit.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">+</span>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-slate-600">
              Stap 5: BTW ({(product.vat_rate * 100).toFixed(0)}%)
            </p>
            <p className="text-xl font-bold text-blue-600">
              €{(calculations.sellingPriceExclVAT * product.vat_rate).toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">=</span>
          </div>

          <div className="p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg border-2 border-blue-400">
            <p className="text-sm text-slate-600">✅ Verkoopprijs (incl. BTW)</p>
            <p className="text-3xl font-bold text-blue-700">€{calculations.sellingPriceInclVAT.toFixed(2)}</p>
            <p className="text-xs text-slate-600 mt-2">
              Totale marge: {calculations.totalMarginPercentage.toFixed(2)}%
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Dit is wat de klant betaalt
            </p>
          </div>
        </div>
      </div>

      {/* Belangrijke Regels */}
      <div className="rounded-2xl border border-red-300 bg-red-50 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          ⚠️ Belangrijke Ondernemersregels
        </h3>
        <ul className="space-y-2 text-slate-700">
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">1.</span>
            <span>Verkoop <span className="font-bold text-red-600">NOOIT</span> onder je kostprijs van €{calculations.costPrice.toFixed(2)}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">2.</span>
            <span>Derving is al verrekend in je kostprijs - BTW voeg je toe aan het einde</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">3.</span>
            <span>Kies de juiste winstmarge per producttype (30% basis, 40% normaal, 60% luxe)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">4.</span>
            <span>De verkoopprijs incl. BTW is wat de klant betaalt - BTW moet je afdragen aan de Belastingdienst</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">5.</span>
            <span>Als je maandrekening niet klopt → je winstmarge is te laag of je kosten zijn te hoog</span>
          </li>
        </ul>
        <div className="mt-4 p-3 bg-white rounded-lg border border-red-200">
          <p className="text-sm font-semibold text-green-700">
            ✅ Met {(product.profit_margin_pct * 100).toFixed(0)}% winst: €{product.purchase_cost.toFixed(2)} inkoop → €{calculations.sellingPriceExclVAT.toFixed(2)} excl. BTW (€{calculations.sellingPriceInclVAT.toFixed(2)} incl. BTW) = €{calculations.profitPerUnit.toFixed(2)} pure winst per stuk!
          </p>
        </div>
      </div>
    </div>
  );
}
