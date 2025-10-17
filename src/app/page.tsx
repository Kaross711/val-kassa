export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Welkom 👋</h1>
      <p className="text-slate-300">
        Ga naar{" "}
        <a className="underline decoration-teal-300/70 underline-offset-4 hover:text-white" href="/kassa">
          Kassa
        </a>{" "}
        of{" "}
        <a className="underline decoration-violet-400/70 underline-offset-4 hover:text-white" href="/admin/prices">
          Dagprijzen
        </a>
        .
      </p>

      <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-[conic-gradient(from_180deg_at_50%_50%,rgba(124,58,237,0.2),rgba(34,197,194,0.2),transparent_70%)] blur-2xl" />
        <div className="relative">
          <h2 className="text-xl font-semibold">Snel starten</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-300">
            <li>• Voeg producten toe aan je bon in <a className="underline" href="/kassa">Kassa</a></li>
            <li>• Beheer prijzen in <a className="underline" href="/admin/prices">Dagprijzen</a></li>
            <li>• Bekijk omzet in <a className="underline" href="/verkoop">Verkoop</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
