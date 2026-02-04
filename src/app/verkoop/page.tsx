"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SaleType = "WINKEL" | "BESTELLING" | "BEDRIJF";

type ReceiptItem = {
    id: string;
    product_id: string;
    unit_price: number;
    quantity: number | null;
    weight_kg: number | null;
    line_total: number;
    unit: string;
    product_name?: string;
};

type Receipt = {
    id: string;
    created_at: string;
    total_gross: number;
    note: string | null;
    sale_type: SaleType;
    items?: ReceiptItem[];
};

type PurchaseOrder = {
    id: string;
    created_at: string;
    total_amount: number;
    supplier: string | null;
    note: string | null;
};

type ReceiptsByType = {
    winkel: Receipt[];
    bestelling: Receipt[];
    bedrijf: Receipt[];
};

type Totals = {
    winkel: number;
    bestelling: number;
    bedrijf: number;
    totaalVerkoop: number;
    totaalInkoop: number;
    winst: number;
};

type DateRange = {
    start: Date;
    end: Date;
};

// Helper functie om datum string (YYYY-MM-DD) te parsen als lokale tijd (niet UTC)
function parseDateLocal(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Helper functie om Date object te formatteren naar YYYY-MM-DD voor input
function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper functie om Date te converteren naar ISO string met lokale tijd (voorkomt timezone shift)
function toLocalISOString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

export default function VerkoopPage() {
    const [receipts, setReceipts] = useState<ReceiptsByType>({
        winkel: [],
        bestelling: [],
        bedrijf: [],
    });
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [totals, setTotals] = useState<Totals>({
        winkel: 0,
        bestelling: 0,
        bedrijf: 0,
        totaalVerkoop: 0,
        totaalInkoop: 0,
        winst: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<"vandaag" | "week" | "maand" | "custom" | "alles">("vandaag");
    const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
    const [receiptItems, setReceiptItems] = useState<Record<string, ReceiptItem[]>>({});
    const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});

    // Custom date range
    const [customDateRange, setCustomDateRange] = useState<DateRange>({
        start: new Date(),
        end: new Date(),
    });
    const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [minAmount, setMinAmount] = useState("");
    const [maxAmount, setMaxAmount] = useState("");
    const [selectedType, setSelectedType] = useState<SaleType | "ALLES">("ALLES");

    // Database counts (uit RPC functie, voor correcte totalen)
    const [dbCounts, setDbCounts] = useState({
        totaalTransacties: 0,
        winkelCount: 0,
        bestellingCount: 0,
        bedrijfCount: 0,
        inkoopCount: 0,
    });

    // Statistieken
    const [stats, setStats] = useState({
        gemiddeldeBon: 0,
        hoogsteBon: 0,
        laagsteBon: 0,
        totaalTransacties: 0,
        gemiddeldeInkoop: 0,
        winstMarge: 0,
    });

    // Inklapbare secties
    const [collapsedSections, setCollapsedSections] = useState({
        winkel: false,
        bestelling: false,
        bedrijf: false,
        inkoop: false,
    });

    function toggleSection(section: 'winkel' | 'bestelling' | 'bedrijf' | 'inkoop') {
        setCollapsedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    }

    useEffect(() => {
        loadData();
    }, [selectedPeriod, customDateRange]);

    useEffect(() => {
        calculateStats();
    }, [receipts, purchaseOrders, dbCounts, totals]);

    async function loadData() {
        setLoading(true);
        setError(null);

        try {
            // Bepaal datum filter
            let startDate: string | null = null;
            let endDate: string | null = null;
            const now = new Date();

            if (selectedPeriod === "vandaag") {
                // Vandaag: 00:00 vandaag tot einde van vandaag
                const today = new Date(now);
                today.setHours(0, 0, 0, 0);
                startDate = toLocalISOString(today);

                const endOfToday = new Date(now);
                endOfToday.setHours(23, 59, 59, 999);
                endDate = toLocalISOString(endOfToday);
            } else if (selectedPeriod === "week") {
                // Deze week: maandag van deze week tot vandaag (einde van de dag)
                const today = new Date(now);
                const dayOfWeek = today.getDay(); // 0 = zondag, 1 = maandag, etc.
                const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Zondag = 6 dagen terug naar maandag

                const monday = new Date(today);
                monday.setDate(today.getDate() - daysToMonday);
                monday.setHours(0, 0, 0, 0);
                startDate = toLocalISOString(monday);

                const endOfToday = new Date(now);
                endOfToday.setHours(23, 59, 59, 999);
                endDate = toLocalISOString(endOfToday);
            } else if (selectedPeriod === "maand") {
                // Deze maand: 1e van de maand tot vandaag (einde van de dag)
                const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                startDate = toLocalISOString(firstOfMonth);

                const endOfToday = new Date(now);
                endOfToday.setHours(23, 59, 59, 999);
                endDate = toLocalISOString(endOfToday);
            } else if (selectedPeriod === "custom") {
                // Custom: gebruik de geselecteerde datums
                const customStart = new Date(customDateRange.start);
                customStart.setHours(0, 0, 0, 0);
                startDate = toLocalISOString(customStart);

                const customEnd = new Date(customDateRange.end);
                customEnd.setHours(23, 59, 59, 999);
                endDate = toLocalISOString(customEnd);
            } else if (selectedPeriod === "alles") {
                // Alles: gebruik een hele grote range (2020 tot ver in de toekomst)
                startDate = "2020-01-01T00:00:00.000";
                endDate = "2099-12-31T23:59:59.999";
            }

            // Haal TOTALEN op via database functie (omzeilt 1000 row limiet)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let totalsResult: any = null;

            if (startDate && endDate) {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_period_totals', {
                        start_date: startDate,
                        end_date: endDate
                    });

                if (rpcError) {
                    console.error('RPC error:', rpcError);
                } else {
                    totalsResult = rpcData;
                }
            }

            // Laad verkopen (receipts) voor de lijst weergave (max 1000 voor performance)
            let receiptsQuery = supabase
                .from("receipts")
                .select("id, created_at, total_gross, note, sale_type");

            if (startDate) {
                receiptsQuery = receiptsQuery.gte("created_at", startDate);
            }

            if (endDate) {
                receiptsQuery = receiptsQuery.lte("created_at", endDate);
            }

            const { data: receiptsData, error: receiptsError } = await receiptsQuery
                .order("created_at", { ascending: false })
                .limit(1000);

            if (receiptsError) throw receiptsError;

            // Groepeer verkopen per type (alleen voor weergave in de lijst)
            const groupedReceipts: ReceiptsByType = {
                winkel: [],
                bestelling: [],
                bedrijf: [],
            };

            (receiptsData || []).forEach((receipt: Receipt) => {
                const type = receipt.sale_type || "WINKEL";

                if (type === "WINKEL") {
                    groupedReceipts.winkel.push(receipt);
                } else if (type === "BESTELLING") {
                    groupedReceipts.bestelling.push(receipt);
                } else if (type === "BEDRIJF") {
                    groupedReceipts.bedrijf.push(receipt);
                }
            });

            // Laad inkopen (purchase_orders) voor de lijst weergave (max 1000 voor performance)
            let purchasesQuery = supabase
                .from("purchase_orders")
                .select("id, created_at, total_amount, supplier, note");

            if (startDate) {
                purchasesQuery = purchasesQuery.gte("created_at", startDate);
            }

            if (endDate) {
                purchasesQuery = purchasesQuery.lte("created_at", endDate);
            }

            const { data: purchasesData, error: purchasesError } = await purchasesQuery
                .order("created_at", { ascending: false })
                .limit(1000);

            if (purchasesError) throw purchasesError;

            setReceipts(groupedReceipts);
            setPurchaseOrders(purchasesData || []);

            // Gebruik totalen uit database functie (correct!) of fallback naar lokale berekening
            if (totalsResult) {
                setTotals({
                    winkel: totalsResult.winkel_verkoop || 0,
                    bestelling: totalsResult.bestelling_verkoop || 0,
                    bedrijf: totalsResult.bedrijf_verkoop || 0,
                    totaalVerkoop: totalsResult.totaal_verkoop || 0,
                    totaalInkoop: totalsResult.totaal_inkoop || 0,
                    winst: (totalsResult.totaal_verkoop || 0) - (totalsResult.totaal_inkoop || 0),
                });

                // Update database counts voor correcte statistieken
                setDbCounts({
                    totaalTransacties: totalsResult.totaal_transacties || 0,
                    winkelCount: totalsResult.winkel_count || 0,
                    bestellingCount: totalsResult.bestelling_count || 0,
                    bedrijfCount: totalsResult.bedrijf_count || 0,
                    inkoopCount: totalsResult.inkoop_count || 0,
                });
            } else {
                // Fallback: lokale berekening (alleen als RPC niet werkt)
                const totaalVerkoop = (receiptsData || []).reduce((sum, r) => sum + r.total_gross, 0);
                const totaalInkoop = (purchasesData || []).reduce((sum, p) => sum + p.total_amount, 0);

                setTotals({
                    winkel: groupedReceipts.winkel.reduce((sum, r) => sum + r.total_gross, 0),
                    bestelling: groupedReceipts.bestelling.reduce((sum, r) => sum + r.total_gross, 0),
                    bedrijf: groupedReceipts.bedrijf.reduce((sum, r) => sum + r.total_gross, 0),
                    totaalVerkoop,
                    totaalInkoop,
                    winst: totaalVerkoop - totaalInkoop,
                });

                // Fallback counts
                setDbCounts({
                    totaalTransacties: (receiptsData || []).length,
                    winkelCount: groupedReceipts.winkel.length,
                    bestellingCount: groupedReceipts.bestelling.length,
                    bedrijfCount: groupedReceipts.bedrijf.length,
                    inkoopCount: (purchasesData || []).length,
                });
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Er is een fout opgetreden");
        } finally {
            setLoading(false);
        }
    }

    async function loadReceiptItems(receiptId: string) {
        if (receiptItems[receiptId]) return;

        setLoadingItems(prev => ({ ...prev, [receiptId]: true }));

        try {
            const { data: items, error: itemsError } = await supabase
                .from("receipt_items")
                .select(`
                    id,
                    product_id,
                    unit_price,
                    quantity,
                    weight_kg,
                    line_total,
                    unit
                `)
                .eq("receipt_id", receiptId);

            if (itemsError) throw itemsError;

            const productIds = (items || []).map(item => item.product_id);
            if (productIds.length > 0) {
                const { data: products } = await supabase
                    .from("products")
                    .select("id, name")
                    .in("id", productIds);

                const productMap = new Map(
                    (products || []).map(p => [p.id, p.name])
                );

                const enrichedItems = (items || []).map(item => ({
                    ...item,
                    product_name: productMap.get(item.product_id) || "Onbekend product",
                }));

                setReceiptItems(prev => ({ ...prev, [receiptId]: enrichedItems }));
            }
        } catch (err) {
            console.error("Fout bij laden items:", err);
        } finally {
            setLoadingItems(prev => ({ ...prev, [receiptId]: false }));
        }
    }

    function toggleReceiptExpansion(receiptId: string) {
        if (expandedReceipt === receiptId) {
            setExpandedReceipt(null);
        } else {
            setExpandedReceipt(receiptId);
            loadReceiptItems(receiptId);
        }
    }

    function calculateStats() {
        const allReceipts = [...receipts.winkel, ...receipts.bestelling, ...receipts.bedrijf];

        if (dbCounts.totaalTransacties === 0 && allReceipts.length === 0) {
            setStats({
                gemiddeldeBon: 0,
                hoogsteBon: 0,
                laagsteBon: 0,
                totaalTransacties: 0,
                gemiddeldeInkoop: 0,
                winstMarge: 0,
            });
            return;
        }

        // Gebruik lokale data voor min/max (deze zijn nog steeds correct uit de sample)
        const receiptTotals = allReceipts.map(r => r.total_gross);
        const max = receiptTotals.length > 0 ? Math.max(...receiptTotals) : 0;
        const min = receiptTotals.length > 0 ? Math.min(...receiptTotals) : 0;

        // Gebruik database totalen voor correcte gemiddeldes
        const totaalTransacties = dbCounts.totaalTransacties || allReceipts.length;
        const gemiddeldeBon = totaalTransacties > 0
            ? totals.totaalVerkoop / totaalTransacties
            : 0;

        const inkoopCount = dbCounts.inkoopCount || purchaseOrders.length;
        const gemiddeldeInkoop = inkoopCount > 0
            ? totals.totaalInkoop / inkoopCount
            : 0;

        const winstMarge = totals.totaalVerkoop > 0
            ? ((totals.totaalVerkoop - totals.totaalInkoop) / totals.totaalVerkoop) * 100
            : 0;

        setStats({
            gemiddeldeBon,
            hoogsteBon: max,
            laagsteBon: min,
            totaalTransacties,
            gemiddeldeInkoop,
            winstMarge,
        });
    }

    function formatDate(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleString("nl-NL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatDateShort(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleDateString("nl-NL", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    async function deleteReceipt(receiptId: string) {
        if (!confirm("Weet je zeker dat je deze verkoop wilt verwijderen?")) return;

        try {
            const { error: itemsError } = await supabase
                .from("receipt_items")
                .delete()
                .eq("receipt_id", receiptId);

            if (itemsError) throw itemsError;

            const { error: receiptError } = await supabase
                .from("receipts")
                .delete()
                .eq("id", receiptId);

            if (receiptError) throw receiptError;

            await loadData();
            setExpandedReceipt(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fout bij verwijderen");
        }
    }

    function exportToCSV() {
        const allReceipts = [...receipts.winkel, ...receipts.bestelling, ...receipts.bedrijf];

        const csvContent = [
            ["Type", "Datum", "Bedrag", "Opmerking"],
            ...allReceipts.map(receipt => [
                "Verkoop",
                formatDate(receipt.created_at),
                receipt.total_gross.toFixed(2),
                receipt.note || "",
            ]),
            ...purchaseOrders.map(purchase => [
                "Inkoop",
                formatDate(purchase.created_at),
                `-${purchase.total_amount.toFixed(2)}`,
                purchase.supplier || "",
            ])
        ].map(row => row.join(",")).join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `verkoop_inkoop_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function getFilteredReceipts(receiptsList: Receipt[]) {
        return receiptsList.filter(receipt => {
            if (selectedType !== "ALLES" && receipt.sale_type !== selectedType) return false;
            if (minAmount && receipt.total_gross < parseFloat(minAmount)) return false;
            if (maxAmount && receipt.total_gross > parseFloat(maxAmount)) return false;
            if (searchQuery && receipt.note) {
                return receipt.note.toLowerCase().includes(searchQuery.toLowerCase());
            }
            return true;
        });
    }

    function ReceiptsSection({
                                 title,
                                 receipts,
                                 color,
                                 bgColor,
                                 saleType,
                                 isCollapsed,
                                 onToggle
                             }: {
        title: string;
        receipts: Receipt[];
        color: string;
        bgColor: string;
        saleType: SaleType;
        isCollapsed: boolean;
        onToggle: () => void;
    }) {
        const filteredReceipts = getFilteredReceipts(receipts);
        const sectionTotal = filteredReceipts.reduce((sum, receipt) => sum + receipt.total_gross, 0);

        return (
            <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div
                    className={`${bgColor} px-6 py-4 border-b border-gray-200 cursor-pointer hover:brightness-95 transition`}
                    onClick={onToggle}
                >
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <button className={`text-2xl ${color} font-bold`}>
                                {isCollapsed ? "▶" : "▼"}
                            </button>
                            <h2 className={`text-xl font-bold ${color}`}>{title}</h2>
                        </div>
                        <div className="text-right">
                            <div className={`text-2xl font-bold ${color}`}>
                                € {sectionTotal.toFixed(2)}
                            </div>
                            <div className="text-sm text-slate-600">
                                {filteredReceipts.length} transactie{filteredReceipts.length !== 1 ? "s" : ""}
                            </div>
                        </div>
                    </div>
                </div>

                {!isCollapsed && (
                    <div className="p-6">
                        {filteredReceipts.length === 0 ? (
                            <p className="text-slate-500 text-sm text-center py-8">
                                Geen {title.toLowerCase()} gevonden met de huidige filters.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {filteredReceipts.map((receipt) => {
                                    const isExpanded = expandedReceipt === receipt.id;
                                    const items = receiptItems[receipt.id] || [];
                                    const isLoadingItems = loadingItems[receipt.id];

                                    return (
                                        <div
                                            key={receipt.id}
                                            className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition"
                                        >
                                            <div
                                                className="p-4 cursor-pointer hover:bg-gray-50 transition"
                                                onClick={() => toggleReceiptExpansion(receipt.id)}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="text-sm text-slate-600 mb-1">
                                                            {formatDateShort(receipt.created_at)}
                                                        </div>
                                                        {receipt.note && (
                                                            <div className="text-sm text-slate-700 italic">
                                                                {receipt.note}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xl font-bold text-slate-900">
                                                            € {receipt.total_gross.toFixed(2)}
                                                        </div>
                                                        <button className="text-xs text-blue-600 hover:text-blue-700 mt-1">
                                                            {isExpanded ? "▼ Details" : "▶ Details"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="border-t border-gray-200 bg-gray-50 p-4">
                                                    {isLoadingItems ? (
                                                        <div className="text-center py-4 text-slate-500">Laden...</div>
                                                    ) : items.length === 0 ? (
                                                        <div className="text-center py-4 text-slate-500">Geen items gevonden</div>
                                                    ) : (
                                                        <>
                                                            <div className="mb-3 font-semibold text-slate-700">Producten:</div>
                                                            <div className="space-y-2 mb-4">
                                                                {items.map((item) => (
                                                                    <div
                                                                        key={item.id}
                                                                        className="bg-white rounded p-3 border border-gray-200"
                                                                    >
                                                                        <div className="flex justify-between items-start">
                                                                            <div>
                                                                                <div className="font-medium text-slate-900">
                                                                                    {item.product_name}
                                                                                </div>
                                                                                <div className="text-sm text-slate-600 mt-1">
                                                                                    € {item.unit_price.toFixed(2)} per {item.unit}
                                                                                </div>
                                                                                {item.quantity !== null && (
                                                                                    <div className="text-sm text-slate-600">
                                                                                        Aantal: {item.quantity} stuks
                                                                                    </div>
                                                                                )}
                                                                                {item.weight_kg !== null && (
                                                                                    <div className="text-sm text-slate-600">
                                                                                        Gewicht: {item.weight_kg} kg
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-right">
                                                                                <div className="font-bold text-slate-900">
                                                                                    € {item.line_total.toFixed(2)}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="flex justify-between items-center pt-3 border-t border-gray-300">
                                                                <div className="text-sm text-slate-600">
                                                                    Volledige datum: {formatDate(receipt.created_at)}
                                                                </div>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        deleteReceipt(receipt.id);
                                                                    }}
                                                                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                                                                >
                                                                    Verwijderen
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Inkopen sectie
    function PurchasesSection() {
        const isCollapsed = collapsedSections.inkoop;

        return (
            <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div
                    className="bg-red-50 px-6 py-4 border-b border-gray-200 cursor-pointer hover:brightness-95 transition"
                    onClick={() => toggleSection('inkoop')}
                >
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <button className="text-2xl text-red-700 font-bold">
                                {isCollapsed ? "▶" : "▼"}
                            </button>
                            <h2 className="text-xl font-bold text-red-700">Inkopen</h2>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-red-700">
                                € {totals.totaalInkoop.toFixed(2)}
                            </div>
                            <div className="text-sm text-slate-600">
                                {purchaseOrders.length} inkoop{purchaseOrders.length !== 1 ? "orders" : "order"}
                            </div>
                        </div>
                    </div>
                </div>

                {!isCollapsed && (
                    <div className="p-6">
                        {purchaseOrders.length === 0 ? (
                            <p className="text-slate-500 text-sm text-center py-8">
                                Geen inkopen in deze periode.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {purchaseOrders.map((purchase) => (
                                    <div
                                        key={purchase.id}
                                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-sm text-slate-600 mb-1">
                                                    {formatDateShort(purchase.created_at)}
                                                </div>
                                                {purchase.supplier && (
                                                    <div className="text-sm text-slate-700 font-medium">
                                                        Leverancier: {purchase.supplier}
                                                    </div>
                                                )}
                                                {purchase.note && (
                                                    <div className="text-sm text-slate-600 italic mt-1">
                                                        {purchase.note}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold text-red-700">
                                                    € {purchase.total_amount.toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl text-slate-600">Laden...</div>
            </div>
        );
    }

    const winstColor = totals.winst >= 0 ? "text-green-600" : "text-red-600";

    return (
        <div className="min-h-screen">
            {error && (
                <div className="fixed top-4 left-4 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg max-w-md">
                    {error}
                    <button onClick={() => setError(null)} className="ml-4 underline">
                        Sluiten
                    </button>
                </div>
            )}

            <div className="mx-auto max-w-7xl px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-3xl font-bold text-slate-900">Verkoop & Inkoop overzicht</h1>
                        <button
                            onClick={exportToCSV}
                            className="px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:brightness-110 transition shadow-md"
                        >
                            📥 Exporteer CSV
                        </button>
                    </div>

                    {/* Periode selectie */}
                    <div className="flex flex-wrap gap-2 mb-6">
                        <button
                            onClick={() => setSelectedPeriod("vandaag")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                selectedPeriod === "vandaag"
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Vandaag
                        </button>
                        <button
                            onClick={() => setSelectedPeriod("week")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                selectedPeriod === "week"
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Deze week
                        </button>
                        <button
                            onClick={() => setSelectedPeriod("maand")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                selectedPeriod === "maand"
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Deze maand
                        </button>
                        <button
                            onClick={() => {
                                setSelectedPeriod("custom");
                                setShowCustomDatePicker(true);
                            }}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                selectedPeriod === "custom"
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Aangepaste periode
                        </button>
                        <button
                            onClick={() => setSelectedPeriod("alles")}
                            className={`px-4 py-2 rounded-lg font-semibold transition ${
                                selectedPeriod === "alles"
                                    ? "bg-blue-500 text-white shadow-md"
                                    : "bg-white text-slate-700 border border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                            Alles
                        </button>
                    </div>

                    {/* Custom date picker */}
                    {showCustomDatePicker && selectedPeriod === "custom" && (
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 p-4 mb-6 shadow-sm">
                            <div className="flex gap-4 items-end">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Van</label>
                                    <input
                                        type="date"
                                        value={formatDateForInput(customDateRange.start)}
                                        onChange={(e) => setCustomDateRange(prev => ({
                                            ...prev,
                                            start: parseDateLocal(e.target.value)
                                        }))}
                                        className="border border-gray-300 rounded px-3 py-2 text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tot</label>
                                    <input
                                        type="date"
                                        value={formatDateForInput(customDateRange.end)}
                                        onChange={(e) => setCustomDateRange(prev => ({
                                            ...prev,
                                            end: parseDateLocal(e.target.value)
                                        }))}
                                        className="border border-gray-300 rounded px-3 py-2 text-slate-900"
                                    />
                                </div>
                                <button
                                    onClick={() => loadData()}
                                    className="px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:brightness-110 transition"
                                >
                                    Toepassen
                                </button>
                                <button
                                    onClick={() => setShowCustomDatePicker(false)}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-slate-700 font-semibold hover:bg-gray-50 transition"
                                >
                                    Verbergen
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Statistieken */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-4">
                            <div className="text-sm text-slate-600 mb-1">Totaal transacties</div>
                            <div className="text-2xl font-bold text-slate-900">{stats.totaalTransacties}</div>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-4">
                            <div className="text-sm text-slate-600 mb-1">Gemiddelde bon</div>
                            <div className="text-2xl font-bold text-slate-900">€ {stats.gemiddeldeBon.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-4">
                            <div className="text-sm text-slate-600 mb-1">Hoogste bon</div>
                            <div className="text-2xl font-bold text-green-600">€ {stats.hoogsteBon.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-4">
                            <div className="text-sm text-slate-600 mb-1">Laagste bon</div>
                            <div className="text-2xl font-bold text-slate-900">€ {stats.laagsteBon.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-4">
                            <div className="text-sm text-slate-600 mb-1">Gem. inkoop</div>
                            <div className="text-2xl font-bold text-red-600">€ {stats.gemiddeldeInkoop.toFixed(2)}</div>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm p-4">
                            <div className="text-sm text-slate-600 mb-1">Winstmarge</div>
                            <div className={`text-2xl font-bold ${winstColor}`}>{stats.winstMarge.toFixed(1)}%</div>
                        </div>
                    </div>

                    {/* Totalen overzicht */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-blue-600 mb-1">Winkelverkopen</div>
                            <div className="text-2xl font-bold text-slate-900">€ {totals.winkel.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{dbCounts.winkelCount || receipts.winkel.length} transacties</div>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-orange-600 mb-1">Bestellingen</div>
                            <div className="text-2xl font-bold text-slate-900">€ {totals.bestelling.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{dbCounts.bestellingCount || receipts.bestelling.length} transacties</div>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-green-600 mb-1">Bedrijfsverkopen</div>
                            <div className="text-2xl font-bold text-slate-900">€ {totals.bedrijf.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{dbCounts.bedrijfCount || receipts.bedrijf.length} transacties</div>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-red-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-red-600 mb-1">Totaal inkoop</div>
                            <div className="text-2xl font-bold text-red-700">€ {totals.totaalInkoop.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{dbCounts.inkoopCount || purchaseOrders.length} orders</div>
                        </div>

                        <div className={`rounded-xl shadow-md p-6 ${totals.winst >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                            <div className="text-sm font-medium text-white/90 mb-1">Winst</div>
                            <div className="text-2xl font-bold text-white">€ {totals.winst.toFixed(2)}</div>
                            <div className="text-xs text-white/80 mt-1">
                                Verkoop - Inkoop
                            </div>
                        </div>
                    </div>
                </div>

                {/* Verkopen & Inkopen per type */}
                <div className="space-y-6">
                    <ReceiptsSection
                        title="Winkelverkopen"
                        receipts={receipts.winkel}
                        color="text-blue-700"
                        bgColor="bg-blue-50"
                        saleType="WINKEL"
                        isCollapsed={collapsedSections.winkel}
                        onToggle={() => toggleSection('winkel')}
                    />

                    <ReceiptsSection
                        title="Bestellingen"
                        receipts={receipts.bestelling}
                        color="text-orange-700"
                        bgColor="bg-orange-50"
                        saleType="BESTELLING"
                        isCollapsed={collapsedSections.bestelling}
                        onToggle={() => toggleSection('bestelling')}
                    />

                    <ReceiptsSection
                        title="Bedrijfsverkopen"
                        receipts={receipts.bedrijf}
                        color="text-green-700"
                        bgColor="bg-green-50"
                        saleType="BEDRIJF"
                        isCollapsed={collapsedSections.bedrijf}
                        onToggle={() => toggleSection('bedrijf')}
                    />

                    <PurchasesSection />
                </div>
            </div>
        </div>
    );
}