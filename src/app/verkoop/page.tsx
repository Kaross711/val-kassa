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
    }, [receipts, purchaseOrders]);

    async function loadData() {
        setLoading(true);
        setError(null);

        try {
            // Bepaal datum filter
            let startDate: string | null = null;
            const now = new Date();

            if (selectedPeriod === "vandaag") {
                startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
            } else if (selectedPeriod === "week") {
                startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
            } else if (selectedPeriod === "maand") {
                startDate = new Date(now.setDate(now.getDate() - 30)).toISOString();
            } else if (selectedPeriod === "custom") {
                startDate = customDateRange.start.toISOString();
            }

            // Laad verkopen (receipts)
            let receiptsQuery = supabase
                .from("receipts")
                .select("id, created_at, total_gross, note, sale_type")
                .order("created_at", { ascending: false });

            if (startDate) {
                receiptsQuery = receiptsQuery.gte("created_at", startDate);
            }

            if (selectedPeriod === "custom") {
                receiptsQuery = receiptsQuery.lte("created_at", customDateRange.end.toISOString());
            }

            const { data: receiptsData, error: receiptsError } = await receiptsQuery;

            if (receiptsError) throw receiptsError;

            // Groepeer verkopen per type
            const groupedReceipts: ReceiptsByType = {
                winkel: [],
                bestelling: [],
                bedrijf: [],
            };

            let totaalVerkoop = 0;

            (receiptsData || []).forEach((receipt: Receipt) => {
                const type = receipt.sale_type || "WINKEL";

                if (type === "WINKEL") {
                    groupedReceipts.winkel.push(receipt);
                } else if (type === "BESTELLING") {
                    groupedReceipts.bestelling.push(receipt);
                } else if (type === "BEDRIJF") {
                    groupedReceipts.bedrijf.push(receipt);
                }

                totaalVerkoop += receipt.total_gross;
            });

            // Laad inkopen (purchase_orders)
            let purchasesQuery = supabase
                .from("purchase_orders")
                .select("id, created_at, total_amount, supplier, note")
                .order("created_at", { ascending: false });

            if (startDate) {
                purchasesQuery = purchasesQuery.gte("created_at", startDate);
            }

            if (selectedPeriod === "custom") {
                purchasesQuery = purchasesQuery.lte("created_at", customDateRange.end.toISOString());
            }

            const { data: purchasesData, error: purchasesError } = await purchasesQuery;

            if (purchasesError) throw purchasesError;

            const totaalInkoop = (purchasesData || []).reduce((sum, p) => sum + p.total_amount, 0);

            setReceipts(groupedReceipts);
            setPurchaseOrders(purchasesData || []);

            setTotals({
                winkel: groupedReceipts.winkel.reduce((sum, r) => sum + r.total_gross, 0),
                bestelling: groupedReceipts.bestelling.reduce((sum, r) => sum + r.total_gross, 0),
                bedrijf: groupedReceipts.bedrijf.reduce((sum, r) => sum + r.total_gross, 0),
                totaalVerkoop,
                totaalInkoop,
                winst: totaalVerkoop - totaalInkoop,
            });

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

        if (allReceipts.length === 0) {
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

        const receiptTotals = allReceipts.map(r => r.total_gross);
        const sum = receiptTotals.reduce((a, b) => a + b, 0);
        const avg = sum / receiptTotals.length;
        const max = Math.max(...receiptTotals);
        const min = Math.min(...receiptTotals);

        const avgPurchase = purchaseOrders.length > 0
            ? purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0) / purchaseOrders.length
            : 0;

        const winstMarge = totals.totaalVerkoop > 0
            ? ((totals.totaalVerkoop - totals.totaalInkoop) / totals.totaalVerkoop) * 100
            : 0;

        setStats({
            gemiddeldeBon: avg,
            hoogsteBon: max,
            laagsteBon: min,
            totaalTransacties: allReceipts.length,
            gemiddeldeInkoop: avgPurchase,
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
                                        value={customDateRange.start.toISOString().split('T')[0]}
                                        onChange={(e) => setCustomDateRange(prev => ({
                                            ...prev,
                                            start: new Date(e.target.value)
                                        }))}
                                        className="border border-gray-300 rounded px-3 py-2 text-slate-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tot</label>
                                    <input
                                        type="date"
                                        value={customDateRange.end.toISOString().split('T')[0]}
                                        onChange={(e) => setCustomDateRange(prev => ({
                                            ...prev,
                                            end: new Date(e.target.value)
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
                            <div className="text-xs text-slate-500 mt-1">{receipts.winkel.length} transacties</div>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-orange-600 mb-1">Bestellingen</div>
                            <div className="text-2xl font-bold text-slate-900">€ {totals.bestelling.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{receipts.bestelling.length} transacties</div>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-green-600 mb-1">Bedrijfsverkopen</div>
                            <div className="text-2xl font-bold text-slate-900">€ {totals.bedrijf.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{receipts.bedrijf.length} transacties</div>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-red-200 shadow-sm p-6">
                            <div className="text-sm font-medium text-red-600 mb-1">Totaal inkoop</div>
                            <div className="text-2xl font-bold text-red-700">€ {totals.totaalInkoop.toFixed(2)}</div>
                            <div className="text-xs text-slate-500 mt-1">{purchaseOrders.length} orders</div>
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