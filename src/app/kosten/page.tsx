"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Kostenpost = {
    id: string;
    naam: string;
    type: "vast" | "variabel";
    uurtarief: number | null;
    actief: boolean;
    sort_order: number;
};

type Periode = {
    id: string;
    kostenpost_id: string;
    bedrag_per_week: number;
    geldig_vanaf: string; // YYYY-MM-DD
};

type Week = {
    id: string;
    kostenpost_id: string;
    week_start: string; // YYYY-MM-DD (maandag)
    uren: number;
    uurtarief: number;
};

// Fallback-import (dezelfde standaardposten als in de oude versie) als de browser niks heeft
const DEFAULT_KOSTEN: { naam: string; bedragPerWeek: number }[] = [
    { naam: "Pand / Huur", bedragPerWeek: 391.20 },
    { naam: "Auto / Diesel", bedragPerWeek: 69.20 },
    { naam: "Auto / Aflossing", bedragPerWeek: 237.40 },
    { naam: "Personeel / MO", bedragPerWeek: 115.40 },
    { naam: "Personeel / Karos", bedragPerWeek: 230.90 },
    { naam: "Boekhouding / MO", bedragPerWeek: 27.70 },
];

function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function mondayOf(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay(); // 0 = zo
    const back = dow === 0 ? 6 : dow - 1;
    dt.setDate(dt.getDate() - back);
    return formatDate(dt);
}

function weekLabel(weekStart: string): string {
    const [y, m, d] = weekStart.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const f = (dt: Date) => dt.toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
    return `${f(start)} – ${f(end)}`;
}

function nlDate(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });
}

function parseBedrag(v: string): number {
    return parseFloat(v.replace(",", "."));
}

export default function KostenPage() {
    const [posts, setPosts] = useState<Kostenpost[]>([]);
    const [periodes, setPeriodes] = useState<Periode[]>([]);
    const [weken, setWeken] = useState<Week[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    // Nieuwe kostenpost
    const [addingPost, setAddingPost] = useState(false);
    const [newNaam, setNewNaam] = useState("");
    const [newType, setNewType] = useState<"vast" | "variabel">("vast");
    const [newBedrag, setNewBedrag] = useState("");
    const [newVanaf, setNewVanaf] = useState(formatDate(new Date()));
    const [newTarief, setNewTarief] = useState("");

    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        setLoading(true);
        setError(null);
        try {
            const [postsRes, periodesRes, wekenRes] = await Promise.all([
                supabase.from("kostenposten").select("*").eq("actief", true).order("sort_order").order("naam"),
                supabase.from("kosten_periodes").select("*").order("geldig_vanaf", { ascending: false }),
                supabase.from("kosten_weken").select("*").order("week_start", { ascending: false }),
            ]);
            if (postsRes.error) throw postsRes.error;
            if (periodesRes.error) throw periodesRes.error;
            if (wekenRes.error) throw wekenRes.error;
            setPosts((postsRes.data || []) as Kostenpost[]);
            setPeriodes((periodesRes.data || []) as Periode[]);
            setWeken((wekenRes.data || []) as Week[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij laden");
        } finally {
            setLoading(false);
        }
    }

    function periodesFor(postId: string) {
        return periodes.filter((p) => p.kostenpost_id === postId);
    }
    function wekenFor(postId: string) {
        return weken.filter((w) => w.kostenpost_id === postId);
    }

    // Huidig geldend weekbedrag (vandaag) voor een vaste post
    function huidigBedrag(postId: string): number {
        const today = formatDate(new Date());
        const geldig = periodesFor(postId)
            .filter((p) => p.geldig_vanaf <= today)
            .sort((a, b) => (a.geldig_vanaf < b.geldig_vanaf ? 1 : -1));
        return geldig.length > 0 ? Number(geldig[0].bedrag_per_week) : 0;
    }

    // ── Import uit browser (eenmalig, als er nog geen posten zijn) ────────────
    async function importFromBrowser() {
        let bron = DEFAULT_KOSTEN;
        try {
            const stored = localStorage.getItem("val-kassa-vaste-kosten");
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    bron = parsed.map((c: { naam: string; bedragPerWeek: number }) => ({
                        naam: c.naam,
                        bedragPerWeek: Number(c.bedragPerWeek),
                    }));
                }
            }
        } catch {
            // fallback naar defaults
        }
        if (!confirm(`${bron.length} kostenposten importeren met bedragen geldig vanaf 01-01-2020?\n\nDaarna kun je per post vanaf maart de nieuwe bedragen instellen of posten stopzetten.`)) return;

        try {
            for (let i = 0; i < bron.length; i++) {
                const { data: post, error: postErr } = await supabase
                    .from("kostenposten")
                    .insert({ naam: bron[i].naam, type: "vast", sort_order: i })
                    .select()
                    .single();
                if (postErr) throw postErr;
                const { error: perErr } = await supabase.from("kosten_periodes").insert({
                    kostenpost_id: post.id,
                    bedrag_per_week: bron[i].bedragPerWeek,
                    geldig_vanaf: "2020-01-01",
                });
                if (perErr) throw perErr;
            }
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij importeren");
        }
    }

    // ── Kostenpost toevoegen ─────────────────────────────────────────────────
    async function addPost() {
        if (!newNaam.trim()) return;
        try {
            const { data: post, error: postErr } = await supabase
                .from("kostenposten")
                .insert({
                    naam: newNaam.trim(),
                    type: newType,
                    uurtarief: newType === "variabel" ? parseBedrag(newTarief) || 0 : null,
                    sort_order: posts.length,
                })
                .select()
                .single();
            if (postErr) throw postErr;

            if (newType === "vast") {
                const bedrag = parseBedrag(newBedrag);
                if (!isNaN(bedrag)) {
                    const { error: perErr } = await supabase.from("kosten_periodes").insert({
                        kostenpost_id: post.id,
                        bedrag_per_week: bedrag,
                        geldig_vanaf: newVanaf,
                    });
                    if (perErr) throw perErr;
                }
            }
            setAddingPost(false);
            setNewNaam("");
            setNewBedrag("");
            setNewTarief("");
            setNewType("vast");
            setNewVanaf(formatDate(new Date()));
            await loadAll();
            setExpanded(post.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij toevoegen");
        }
    }

    async function renamePost(post: Kostenpost) {
        const naam = prompt("Nieuwe naam:", post.naam);
        if (naam === null || !naam.trim()) return;
        try {
            const { error } = await supabase.from("kostenposten").update({ naam: naam.trim() }).eq("id", post.id);
            if (error) throw error;
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij hernoemen");
        }
    }

    async function deletePost(post: Kostenpost) {
        if (!confirm(`"${post.naam}" volledig verwijderen? Dit verwijdert ook alle historie van deze post uit alle periodes. Gebruik "Stopzetten" als je de post alleen vanaf een datum wilt beëindigen.`)) return;
        try {
            const { error } = await supabase.from("kostenposten").delete().eq("id", post.id);
            if (error) throw error;
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij verwijderen");
        }
    }

    async function stopPost(post: Kostenpost) {
        const datum = prompt(`Vanaf welke datum stopt "${post.naam}"? (JJJJ-MM-DD)`, formatDate(new Date()));
        if (!datum) return;
        try {
            const { error } = await supabase
                .from("kosten_periodes")
                .upsert(
                    { kostenpost_id: post.id, bedrag_per_week: 0, geldig_vanaf: datum },
                    { onConflict: "kostenpost_id,geldig_vanaf" }
                );
            if (error) throw error;
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij stopzetten");
        }
    }

    // ── Periodes (vaste kosten) ──────────────────────────────────────────────
    const [perBedrag, setPerBedrag] = useState("");
    const [perVanaf, setPerVanaf] = useState(formatDate(new Date()));

    async function addPeriode(postId: string) {
        const bedrag = parseBedrag(perBedrag);
        if (isNaN(bedrag) || !perVanaf) return;
        try {
            const { error } = await supabase
                .from("kosten_periodes")
                .upsert(
                    { kostenpost_id: postId, bedrag_per_week: bedrag, geldig_vanaf: perVanaf },
                    { onConflict: "kostenpost_id,geldig_vanaf" }
                );
            if (error) throw error;
            setPerBedrag("");
            setPerVanaf(formatDate(new Date()));
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij opslaan periode");
        }
    }

    async function deletePeriode(id: string) {
        try {
            const { error } = await supabase.from("kosten_periodes").delete().eq("id", id);
            if (error) throw error;
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij verwijderen");
        }
    }

    // ── Weken (variabele kosten) ─────────────────────────────────────────────
    const [weekStart, setWeekStart] = useState(mondayOf(formatDate(new Date())));
    const [weekUren, setWeekUren] = useState("");

    async function addWeek(post: Kostenpost) {
        const uren = parseBedrag(weekUren);
        if (isNaN(uren)) return;
        try {
            const { error } = await supabase
                .from("kosten_weken")
                .upsert(
                    {
                        kostenpost_id: post.id,
                        week_start: mondayOf(weekStart),
                        uren,
                        uurtarief: post.uurtarief || 0,
                    },
                    { onConflict: "kostenpost_id,week_start" }
                );
            if (error) throw error;
            setWeekUren("");
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij opslaan week");
        }
    }

    async function deleteWeek(id: string) {
        try {
            const { error } = await supabase.from("kosten_weken").delete().eq("id", id);
            if (error) throw error;
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij verwijderen");
        }
    }

    async function updateTarief(post: Kostenpost) {
        const t = prompt(`Uurtarief voor "${post.naam}" (€ per uur):`, String(post.uurtarief ?? ""));
        if (t === null) return;
        const tarief = parseBedrag(t);
        if (isNaN(tarief)) return;
        try {
            const { error } = await supabase.from("kostenposten").update({ uurtarief: tarief }).eq("id", post.id);
            if (error) throw error;
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij opslaan tarief");
        }
    }

    if (loading) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center">
                <div className="text-xl text-slate-600">Laden...</div>
            </div>
        );
    }

    return (
        <div>
            {error && (
                <div className="fixed top-4 left-4 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg max-w-md">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 underline">Sluiten</button>
                </div>
            )}

            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Kosten beheren</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Elke kostenpost houdt zijn eigen geschiedenis bij. Pas je een bedrag aan vanaf een datum, dan blijven oudere periodes ongewijzigd — geen terugwerkende kracht.
                </p>
            </div>

            {posts.length === 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6 text-center">
                    <p className="text-slate-700 mb-4">Er staan nog geen kostenposten in de database.</p>
                    <button
                        onClick={importFromBrowser}
                        className="px-5 py-3 min-h-[44px] rounded-lg bg-purple-500 text-white font-semibold hover:brightness-110 active:scale-95 transition"
                    >
                        Importeer mijn huidige kosten
                    </button>
                    <p className="text-xs text-slate-500 mt-3">Neemt je bestaande vaste kosten over, geldig vanaf 01-01-2020. Daarna stel je vanaf maart de nieuwe bedragen in.</p>
                </div>
            )}

            <div className="space-y-4">
                {posts.map((post) => {
                    const isOpen = expanded === post.id;
                    const postPeriodes = periodesFor(post.id);
                    const postWeken = wekenFor(post.id);
                    const huidig = huidigBedrag(post.id);

                    return (
                        <div key={post.id} className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div
                                className="px-4 sm:px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition"
                                onClick={() => setExpanded(isOpen ? null : post.id)}
                            >
                                <div className="flex justify-between items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl text-slate-400">{isOpen ? "▼" : "▶"}</span>
                                        <div>
                                            <div className="font-bold text-slate-900">
                                                {post.naam}
                                                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${post.type === "variabel" ? "text-purple-600 bg-purple-50" : "text-blue-600 bg-blue-50"}`}>
                                                    {post.type}
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                {post.type === "vast"
                                                    ? `Nu € ${huidig.toFixed(2)} / week`
                                                    : `€ ${(post.uurtarief ?? 0).toFixed(2)} / uur · ${postWeken.length} week${postWeken.length !== 1 ? "en" : ""} ingevuld`}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {isOpen && (
                                <div className="p-4 sm:p-6">
                                    {post.type === "vast" ? (
                                        <>
                                            <div className="font-semibold text-slate-700 mb-2">Bedragen (geldig vanaf)</div>
                                            <div className="space-y-2 mb-4">
                                                {postPeriodes.length === 0 && (
                                                    <p className="text-sm text-slate-500">Nog geen bedragen ingesteld.</p>
                                                )}
                                                {postPeriodes.map((per) => (
                                                    <div key={per.id} className="flex justify-between items-center border border-gray-200 rounded-lg px-4 py-3">
                                                        <div>
                                                            <div className="font-medium text-slate-900">€ {Number(per.bedrag_per_week).toFixed(2)} / week</div>
                                                            <div className="text-sm text-slate-500">vanaf {nlDate(per.geldig_vanaf)}{Number(per.bedrag_per_week) === 0 ? " (gestopt)" : ""}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => deletePeriode(per.id)}
                                                            className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-red-600 hover:bg-red-50 active:bg-red-100 font-medium transition"
                                                        >
                                                            Verwijderen
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="border border-purple-200 rounded-lg p-4 bg-purple-50 mb-4">
                                                <div className="text-sm font-semibold text-slate-700 mb-2">Nieuw bedrag toevoegen</div>
                                                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                                                    <div className="w-full sm:w-[140px]">
                                                        <label className="block text-xs text-slate-500 mb-1">Bedrag / week</label>
                                                        <input type="text" inputMode="decimal" value={perBedrag} onChange={(e) => setPerBedrag(e.target.value)} placeholder="0,00" className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                                    </div>
                                                    <div className="w-full sm:w-auto">
                                                        <label className="block text-xs text-slate-500 mb-1">Geldig vanaf</label>
                                                        <input type="date" value={perVanaf} onChange={(e) => setPerVanaf(e.target.value)} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                                    </div>
                                                    <button onClick={() => addPeriode(post.id)} className="px-4 py-2.5 min-h-[44px] rounded-lg bg-purple-500 text-white font-semibold hover:brightness-110 active:scale-95 transition">
                                                        Opslaan
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="font-semibold text-slate-700">Uren per week</div>
                                                <button onClick={() => updateTarief(post)} className="text-sm text-blue-600 hover:underline">
                                                    Uurtarief: € {(post.uurtarief ?? 0).toFixed(2)} (wijzigen)
                                                </button>
                                            </div>
                                            <div className="space-y-2 mb-4">
                                                {postWeken.length === 0 && (
                                                    <p className="text-sm text-slate-500">Nog geen weken ingevuld.</p>
                                                )}
                                                {postWeken.map((w) => (
                                                    <div key={w.id} className="flex justify-between items-center border border-gray-200 rounded-lg px-4 py-3">
                                                        <div>
                                                            <div className="font-medium text-slate-900">{weekLabel(w.week_start)}</div>
                                                            <div className="text-sm text-slate-500">{Number(w.uren)} uur × € {Number(w.uurtarief).toFixed(2)} = € {(Number(w.uren) * Number(w.uurtarief)).toFixed(2)}</div>
                                                        </div>
                                                        <button onClick={() => deleteWeek(w.id)} className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-red-600 hover:bg-red-50 active:bg-red-100 font-medium transition">
                                                            Verwijderen
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="border border-purple-200 rounded-lg p-4 bg-purple-50 mb-4">
                                                <div className="text-sm font-semibold text-slate-700 mb-2">Week toevoegen / bijwerken</div>
                                                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                                                    <div className="w-full sm:w-auto">
                                                        <label className="block text-xs text-slate-500 mb-1">Week (kies een dag)</label>
                                                        <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                                        <div className="text-xs text-slate-500 mt-1">Week: {weekLabel(mondayOf(weekStart))}</div>
                                                    </div>
                                                    <div className="w-full sm:w-[120px]">
                                                        <label className="block text-xs text-slate-500 mb-1">Uren</label>
                                                        <input type="text" inputMode="decimal" value={weekUren} onChange={(e) => setWeekUren(e.target.value)} placeholder="0" className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                                    </div>
                                                    <button onClick={() => addWeek(post)} className="px-4 py-2.5 min-h-[44px] rounded-lg bg-purple-500 text-white font-semibold hover:brightness-110 active:scale-95 transition">
                                                        Opslaan
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                                        <button onClick={() => renamePost(post)} className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-slate-700 border border-gray-300 hover:bg-gray-50 font-medium transition">
                                            Naam wijzigen
                                        </button>
                                        {post.type === "vast" && (
                                            <button onClick={() => stopPost(post)} className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-amber-700 border border-amber-300 hover:bg-amber-50 font-medium transition">
                                                Stopzetten vanaf datum
                                            </button>
                                        )}
                                        <button onClick={() => deletePost(post)} className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-red-600 border border-red-300 hover:bg-red-50 font-medium transition">
                                            Post verwijderen
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Nieuwe kostenpost */}
            <div className="mt-6">
                {addingPost ? (
                    <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-purple-200 shadow-sm p-4 sm:p-6">
                        <div className="font-semibold text-slate-700 mb-3">Nieuwe kostenpost</div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Naam</label>
                                <input type="text" value={newNaam} onChange={(e) => setNewNaam(e.target.value)} placeholder="Bijv. Medewerker Jan" className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Soort</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setNewType("vast")} className={`flex-1 min-h-[44px] rounded-lg font-medium transition ${newType === "vast" ? "bg-purple-500 text-white" : "bg-white border border-gray-300 text-slate-700"}`}>
                                        Vast (bedrag / week)
                                    </button>
                                    <button onClick={() => setNewType("variabel")} className={`flex-1 min-h-[44px] rounded-lg font-medium transition ${newType === "variabel" ? "bg-purple-500 text-white" : "bg-white border border-gray-300 text-slate-700"}`}>
                                        Variabel (uren × tarief)
                                    </button>
                                </div>
                            </div>

                            {newType === "vast" ? (
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="w-full sm:w-[140px]">
                                        <label className="block text-xs text-slate-500 mb-1">Bedrag / week</label>
                                        <input type="text" inputMode="decimal" value={newBedrag} onChange={(e) => setNewBedrag(e.target.value)} placeholder="0,00" className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                    </div>
                                    <div className="w-full sm:w-auto">
                                        <label className="block text-xs text-slate-500 mb-1">Geldig vanaf</label>
                                        <input type="date" value={newVanaf} onChange={(e) => setNewVanaf(e.target.value)} className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full sm:w-[160px]">
                                    <label className="block text-xs text-slate-500 mb-1">Uurtarief (€ / uur)</label>
                                    <input type="text" inputMode="decimal" value={newTarief} onChange={(e) => setNewTarief(e.target.value)} placeholder="0,00" className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2.5 text-slate-900" />
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button onClick={addPost} className="px-4 py-2.5 min-h-[44px] rounded-lg bg-purple-500 text-white font-semibold hover:brightness-110 active:scale-95 transition">
                                    Toevoegen
                                </button>
                                <button onClick={() => setAddingPost(false)} className="px-4 py-2.5 min-h-[44px] rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition">
                                    Annuleren
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setAddingPost(true)} className="w-full py-3 rounded-lg border-2 border-dashed border-purple-300 text-purple-600 font-semibold hover:bg-purple-50 transition">
                        + Nieuwe kostenpost
                    </button>
                )}
            </div>
        </div>
    );
}
