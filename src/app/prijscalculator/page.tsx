"use client";

import { useState } from "react";

export default function PrijsCalculatorPage() {
  // Vaste kosten
  const [huur, setHuur] = useState<number>(1200);
  const [auto, setAuto] = useState<number>(450);
  const [personeel, setPersoneel] = useState<number>(2500);
  const [overig, setOverig] = useState<number>(300);

  // Inkoop en werkdagen
  const [totaleInkoop, setTotaleInkoop] = useState<number>(8000);
  const [werkdagen, setWerkdagen] = useState<number>(26);

  // Product berekening
  const [inkoopPrijs, setInkoopPrijs] = useState<number>(1.00);
  const [winstMarge, setWinstMarge] = useState<number>(40); // Standaard 40%

  // Berekeningen
  const totaleVasteKosten = huur + auto + personeel + overig;
  const breakEvenPerDag = totaleVasteKosten / werkdagen;
  const kostenOpslagPercentage = (totaleVasteKosten / totaleInkoop) * 100;
  const kostprijs = inkoopPrijs * (1 + kostenOpslagPercentage / 100);
  const verkoopPrijs = kostprijs * (1 + winstMarge / 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Prijscalculator
        </h1>
        <p className="mt-2 text-slate-600">
          Bereken je kostprijs en verkoopprijs op basis van al je bedrijfskosten
        </p>
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">Wat is kostenopslag?</h3>
          <p className="text-sm text-blue-800">
            <strong>Kostenopslag</strong> is het percentage dat je moet toevoegen aan je inkoopprijs om je vaste bedrijfskosten te dekken (huur, auto, personeel, etc.).
          </p>
          <p className="text-sm text-blue-800 mt-2">
            Dit is <strong className="text-red-600">GEEN winst</strong> - dit is puur om break-even te draaien.
            Pas daarna komt je <strong className="text-green-600">winstmarge</strong>!
          </p>
          <p className="text-sm text-blue-900 mt-2 font-medium">
            📌 Systeem: Inkoopprijs + Kostenopslag = Kostprijs + Winstmarge = Verkoopprijs
          </p>
        </div>
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
              value={huur}
              onChange={(e) => setHuur(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>
        </div>
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm font-medium text-green-900">
            Totale Vaste Kosten: <span className="text-lg">€{totaleVasteKosten.toFixed(2)}</span> per maand
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
              value={totaleInkoop}
              onChange={(e) => setTotaleInkoop(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Aantal Werkdagen per Maand
            </label>
            <input
              type="number"
              value={werkdagen}
              onChange={(e) => setWerkdagen(Number(e.target.value))}
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
              €{breakEvenPerDag.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Dit moet je minimaal per dag verdienen
            </p>
          </div>
          <div className="p-4 bg-white rounded-lg border border-orange-200">
            <p className="text-sm text-slate-600">Kostenopslag</p>
            <p className="text-2xl font-bold text-orange-600">
              {kostenOpslagPercentage.toFixed(2)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Minimale opslag op inkoop om kosten te dekken
            </p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-orange-100 rounded-lg border border-orange-300">
          <p className="text-sm font-medium text-orange-900">
            ⚠️ Verkoop je onder {kostenOpslagPercentage.toFixed(2)}% opslag → je draait verlies
          </p>
        </div>
      </div>

      {/* Stap 3: Product Berekening */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          3️⃣ Bereken Verkoopprijs per Product
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Inkoopprijs (€ per kg/stuk)
            </label>
            <input
              type="number"
              step="0.01"
              value={inkoopPrijs}
              onChange={(e) => setInkoopPrijs(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Kies je Winstmarge
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setWinstMarge(30)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  winstMarge === 30
                    ? "border-green-500 bg-green-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-green-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Standaard</p>
                <p className="text-2xl font-bold text-green-600">30%</p>
                <p className="text-xs text-slate-600 mt-1">Basis producten</p>
              </button>

              <button
                onClick={() => setWinstMarge(40)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  winstMarge === 40
                    ? "border-orange-500 bg-orange-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-orange-300"
                }`}
              >
                <p className="font-semibold text-slate-900">Middel</p>
                <p className="text-2xl font-bold text-orange-600">40%</p>
                <p className="text-xs text-slate-600 mt-1">Normaal fruit</p>
              </button>

              <button
                onClick={() => setWinstMarge(60)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  winstMarge === 60
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
            <p className="text-xl font-bold text-blue-600">€{inkoopPrijs.toFixed(2)}</p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">+</span>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-sm text-slate-600">
              Stap 2: Kostenopslag ({kostenOpslagPercentage.toFixed(2)}%)
            </p>
            <p className="text-xl font-bold text-orange-600">
              €{(inkoopPrijs * (kostenOpslagPercentage / 100)).toFixed(2)}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">=</span>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-slate-600">Kostprijs (zonder winst)</p>
            <p className="text-xl font-bold text-purple-600">€{kostprijs.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">
              ⚠️ Verkoop hieronder = verlies
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">+</span>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-slate-600">Stap 3: Winstopslag ({winstMarge}%)</p>
            <p className="text-xl font-bold text-green-600">
              €{(kostprijs * (winstMarge / 100)).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {winstMarge === 30 && "Standaard marge voor basis producten"}
              {winstMarge === 40 && "Gezonde marge voor normaal fruit"}
              {winstMarge === 60 && "Grote marge voor luxe producten"}
            </p>
          </div>

          <div className="flex items-center justify-center">
            <span className="text-2xl">=</span>
          </div>

          <div className="p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg border-2 border-green-400">
            <p className="text-sm text-slate-600">✅ Verkoopprijs (met winst)</p>
            <p className="text-3xl font-bold text-green-700">€{verkoopPrijs.toFixed(2)}</p>
            <p className="text-xs text-slate-600 mt-2">
              Totale marge: {(((verkoopPrijs - inkoopPrijs) / inkoopPrijs) * 100).toFixed(2)}%
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Winst per stuk: €{(verkoopPrijs - kostprijs).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Belangrijke Regel */}
      <div className="rounded-2xl border border-red-300 bg-red-50 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          ⚠️ Belangrijke Ondernemersregels
        </h3>
        <ul className="space-y-2 text-slate-700">
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">1.</span>
            <span>Verkoop <span className="font-bold text-red-600">NOOIT</span> onder je kostprijs van €{kostprijs.toFixed(2)}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">2.</span>
            <span>Kies de juiste winstmarge per producttype (30% basis, 40% normaal, 60% luxe)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 font-bold">3.</span>
            <span>Als je maandrekening niet klopt → je winstmarge is te laag of je kosten zijn te hoog</span>
          </li>
        </ul>
        <div className="mt-4 p-3 bg-white rounded-lg border border-red-200">
          <p className="text-sm font-semibold text-green-700">
            ✅ Met {winstMarge}% winst: €{inkoopPrijs.toFixed(2)} inkoop → €{verkoopPrijs.toFixed(2)} verkoop = €{(verkoopPrijs - kostprijs).toFixed(2)} pure winst per stuk!
          </p>
        </div>
      </div>
    </div>
  );
}
