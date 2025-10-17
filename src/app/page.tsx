export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welkom 👋</h1>
      <p className="text-slate-700">
        Ga naar{" "}
        <a className="underline decoration-green-500/70 underline-offset-4 hover:text-green-600 font-medium" href="/kassa">
          Kassa
        </a>{" "}
        of{" "}
        <a className="underline decoration-orange-500/70 underline-offset-4 hover:text-orange-600 font-medium" href="/admin/prices">
          Dagprijzen
        </a>
        .
      </p>

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
        <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-[conic-gradient(from_180deg_at_50%_50%,rgba(239,68,68,0.1),rgba(74,222,128,0.1),transparent_70%)] blur-2xl" />
        <div className="relative">
          <h2 className="text-xl font-semibold text-slate-900">Snel starten</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            <li>• Voeg producten toe aan je bon in <a className="underline font-medium text-green-600" href="/kassa">Kassa</a></li>
            <li>• Beheer prijzen in <a className="underline font-medium text-orange-600" href="/admin/prices">Dagprijzen</a></li>
            <li>• Bekijk omzet in <a className="underline font-medium text-red-600" href="/verkoop">Verkoop</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}