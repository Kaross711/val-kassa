"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

// ---------- Types ----------
type Product = {
  id: string;
  name: string;
  unit: "STUK" | "KILO";
  stock_quantity: number | null;
};

type PurchaseItem = {
  product_id: string;
  product_name: string;
  quantity: number;        // aantal dozen/pakken op pakbon
  units_per_box: number;   // stuks per pak
  actual_quantity: number; // totaal stuks = quantity * units_per_box
  unit_price: number;      // prijs per stuk
  line_total: number;      // actual_quantity * unit_price
  matched: boolean;
};

type UnmatchedItem = {
  scanned_name: string;
  quantity: number;
  price: number;
  suggestions: Product[];
};

type PurchaseOrder = {
  id: string;
  created_at: string;
  supplier: string | null;
  total_amount: number;
};

type PurchaseOrderItem = {
  product_name: string;
  quantity: number;
  units_per_box: number;
  actual_quantity: number;
  unit_price: number;
  line_total: number;
};

type ScannedItem = {
  product_name: string;
  quantity: number;
  price: number;
};

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export default function InkoopPage() {
  // ---------- State ----------
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedItem[]>([]);
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<PurchaseOrderItem[]>([]);

  const [processing, setProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Handmatig toevoegen form
  const [manualSearch, setManualSearch] = useState("");
  const [manualProductId, setManualProductId] = useState<string>("");
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualUPB, setManualUPB] = useState<number>(1);
  const [manualUnitPrice, setManualUnitPrice] = useState<number>(0);

  // ---------- Effects ----------
  useEffect(() => {
    loadProducts();
    loadOrders();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // ---------- Data loading ----------
  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,unit,stock_quantity")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Fout bij laden producten:", error);
      setError(error.message);
    } else {
      setProducts((data ?? []) as Product[]);
    }
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("id,created_at,supplier,total_amount")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Fout bij laden pakbonnen:", error);
    } else {
      setOrders((data ?? []) as PurchaseOrder[]);
    }
  }

  async function loadOrderDetails(orderId: string) {
    setSelectedOrderId(orderId);

    const { data, error } = await supabase
      .from("purchase_order_items")
      .select(`
        quantity,
        units_per_box,
        actual_quantity,
        unit_price,
        line_total,
        products (name)
      `)
      .eq("purchase_order_id", orderId);

    if (error) {
      console.error("Fout bij laden pakbon details:", error);
      setError(error.message);
    } else {
      const formattedItems = (data ?? []).map((item: any) => ({
        product_name: item.products?.name || "Onbekend",
        quantity: item.quantity,
        units_per_box: item.units_per_box,
        actual_quantity: item.actual_quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      }));
      setSelectedOrderItems(formattedItems);
    }
  }

  async function deleteOrder(orderId: string) {
    const confirmed = window.confirm(
      "Weet je zeker dat je deze pakbon wilt verwijderen? Dit kan NIET ongedaan worden gemaakt!"
    );
    if (!confirmed) return;

    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from("purchase_order_items")
        .select("product_id, actual_quantity")
        .eq("purchase_order_id", orderId);
      if (itemsError) throw itemsError;

      for (const item of orderItems ?? []) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();
        if (product) {
          const newStock = Math.max(0, (product.stock_quantity ?? 0) - item.actual_quantity);
          await supabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", item.product_id);
        }
      }

      const { error: deleteError } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", orderId);
      if (deleteError) throw deleteError;

      setNotification("✓ Pakbon verwijderd en voorraad bijgewerkt");
      setSelectedOrderId(null);
      setSelectedOrderItems([]);
      await loadOrders();
      await loadProducts();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Fout bij verwijderen";
      setError(msg);
      console.error(e);
    }
  }

  // ---------- Helpers ----------
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateUnitsPerBox(index: number, value: number) {
    setItems((prev) => {
      const newItems = [...prev];
      const item = newItems[index];
      const upb = Math.max(1, Math.floor(value));
      const actualQty = item.quantity * upb;
      const lineTotal = Math.round(actualQty * item.unit_price * 100) / 100;
      newItems[index] = {
        ...item,
        units_per_box: upb,
        actual_quantity: actualQty,
        line_total: lineTotal,
      };
      return newItems;
    });
  }

  function updateActualQuantity(index: number, value: number) {
    setItems((prev) => {
      const newItems = [...prev];
      const item = newItems[index];
      const actualQty = Math.max(1, Math.floor(value));
      newItems[index] = { ...item, actual_quantity: actualQty };
      return newItems;
    });
  }

  function findSimilarProducts(scannedName: string): Product[] {
    const name = scannedName.toLowerCase();
    const words = name.split(/[\s\-_]+/);
    const scored = products.map((product) => {
      const productName = product.name.toLowerCase();
      let score = 0;
      if (productName === name) score += 100;
      if (productName.includes(name)) score += 50;
      if (name.includes(productName)) score += 50;
      words.forEach((w) => { if (w.length > 2 && productName.includes(w)) score += 10; });
      if (productName.startsWith(name.slice(0, 3))) score += 5;
      return { product, score };
    });
    return scored.filter(s => s.score > 0).sort((a,b) => b.score - a.score).slice(0,5).map(s => s.product);
  }

  function selectMatch(unmatchedIndex: number, product: Product) {
    const unmatched = unmatchedItems[unmatchedIndex];
    const newItem: PurchaseItem = {
      product_id: product.id,
      product_name: product.name,
      quantity: unmatched.quantity,
      units_per_box: 1,
      actual_quantity: unmatched.quantity * 1,
      unit_price: unmatched.price,
      line_total: Math.round(unmatched.quantity * 1 * unmatched.price * 100) / 100,
      matched: true,
    };
    setItems((prev) => [...prev, newItem]);
    setUnmatchedItems((prev) => prev.filter((_, i) => i !== unmatchedIndex));
    setNotification(`✓ "${unmatched.scanned_name}" gekoppeld aan "${product.name}"`);
  }

  function skipUnmatched(unmatchedIndex: number) {
    setUnmatchedItems((prev) => prev.filter((_, i) => i !== unmatchedIndex));
  }

  // ---------- Handmatig toevoegen ----------
  const filteredProducts = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, manualSearch]);

  function addManualItem() {
    if (!manualProductId) {
      setNotification("Kies eerst een product");
      return;
    }
    const product = products.find(p => p.id === manualProductId);
    if (!product) return;

    const qty = Math.max(1, Math.floor(manualQty));
    const upb = Math.max(1, Math.floor(manualUPB));
    const price = Math.max(0, Number.isFinite(manualUnitPrice) ? manualUnitPrice : 0);
    const actual = qty * upb;
    const line = Math.round(actual * price * 100) / 100;

    const newItem: PurchaseItem = {
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      units_per_box: upb,
      actual_quantity: actual,
      unit_price: price,
      line_total: line,
      matched: true,
    };
    setItems(prev => [...prev, newItem]);

    // reset form voor volgende invoer
    setManualProductId("");
    setManualQty(1);
    setManualUPB(1);
    setManualUnitPrice(0);
    setManualSearch("");
    setNotification("✓ Product handmatig toegevoegd");
  }

  // ---------- Opslaan ----------
  async function savePurchaseOrder() {
    if (items.length === 0) {
      setNotification("Voeg minimaal 1 product toe");
      return;
    }
    if (unmatchedItems.length > 0) {
      const confirm = window.confirm(`Er zijn nog ${unmatchedItems.length} producten niet gekoppeld. Toch opslaan?`);
      if (!confirm) return;
    }

    setSaving(true);
    setError(null);

    try {
      const totalAmount = items.reduce((sum, item) => sum + item.line_total, 0);
      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert([{ supplier: supplier.trim() || null, total_amount: totalAmount }])
        .select("id")
        .single();
      if (orderError) throw orderError;
      const orderId = (order as { id: string }).id;

      const itemsToInsert = items.map((item) => ({
        purchase_order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        units_per_box: item.units_per_box,
        actual_quantity: item.actual_quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      }));
      const { error: itemsError } = await supabase.from("purchase_order_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Voorraad ophogen
      for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);
        if (product) {
          const newStock = (product.stock_quantity ?? 0) + item.actual_quantity;
          const { error: stockError } = await supabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", item.product_id);
          if (stockError) console.error("Fout bij updaten voorraad:", stockError);
        }
      }

      setItems([]);
      setUnmatchedItems([]);
      setSupplier("");
      setUploadedImage(null);
      setNotification("✓ Pakbon succesvol opgeslagen!");
      await loadProducts();
      await loadOrders();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Er is iets misgegaan";
      setError(msg);
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  // ---------- AI scan ----------
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotification("Upload alleen afbeeldingen (JPG, PNG, etc.)");
      return;
    }

    setProcessing(true);
    setNotification("Bezig met AI verwerking...");

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          setUploadedImage(result);
          resolve(result);
        };
        reader.readAsDataURL(file);
      });

      const productNames = products.map((p) => p.name).join(", ");

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Je bent een pakbon scanner. Analyseer deze pakbon en extraheer ALLE producten met hun aantallen en prijzen.

Bekende producten in ons systeem: ${productNames}

Geef het resultaat terug als JSON array met deze structuur:
[
  { "product_name": "exacte productnaam van pakbon", "quantity": aantal_op_pakbon (als nummer), "price": prijs_per_stuk (als nummer) }
]

BELANGRIJK:
- Zoek ALLE producten in de tabel/lijst
- Gebruik de EXACTE naam zoals op de pakbon staat
- Quantity is het eerste getal in de kolom (aantal op pakbon)
- Price is de prijs per stuk in de "Prijs" kolom
- Als er "12" staat bij aantal en "1" bij inhoud, neem dan 1 als quantity (niet 12)
- Retourneer ALLEEN de JSON, geen extra tekst` },
              { type: "image_url", image_url: { url: base64 } },
            ],
          },
        ],
        max_tokens: 1500,
      });

      const content = response.choices[0].message.content;
      if (!content) throw new Error("Geen response van AI");
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Geen geldige JSON gevonden in response");

      const scannedItems: ScannedItem[] = JSON.parse(jsonMatch[0]);
      const newItems: PurchaseItem[] = [];
      const newUnmatched: UnmatchedItem[] = [];
      for (const scanned of scannedItems) {
        let product = products.find((p) => p.name.toLowerCase() === scanned.product_name.toLowerCase());
        if (!product) {
          product = products.find(
            (p) => p.name.toLowerCase().includes(scanned.product_name.toLowerCase()) ||
                   scanned.product_name.toLowerCase().includes(p.name.toLowerCase())
          );
        }
        if (product) {
          newItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity: scanned.quantity,
            units_per_box: 1,
            actual_quantity: scanned.quantity * 1,
            unit_price: scanned.price,
            line_total: Math.round(scanned.quantity * 1 * scanned.price * 100) / 100,
            matched: true,
          });
        } else {
          const suggestions = findSimilarProducts(scanned.product_name);
          newUnmatched.push({ scanned_name: scanned.product_name, quantity: scanned.quantity, price: scanned.price, suggestions });
        }
      }
      setItems(newItems);
      setUnmatchedItems(newUnmatched);
      if (newUnmatched.length > 0) setNotification(`✓ ${newItems.length} producten herkend. ${newUnmatched.length} producten hebben handmatige koppeling nodig.`);
      else setNotification(`✓ ${newItems.length} producten herkend! Vul de "Stuks per pak" in.`);
    } catch (err) {
      console.error("AI fout:", err);
      setNotification("Fout bij verwerken. Probeer opnieuw of voer handmatig in.");
    } finally {
      setProcessing(false);
    }
  }

  function clearScan() {
    setUploadedImage(null);
    setItems([]);
    setUnmatchedItems([]);
  }

  // ---------- Totals ----------
  const totalAmount = items.reduce((sum, item) => sum + item.line_total, 0);
  const btwAmount = totalAmount * 0.09;
  const totalInclBtw = totalAmount * 1.09;

  // ---------- UI ----------
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Inkoop / Pakbonnen</h1>

        {error && <p className="text-red-600 text-sm mb-3 font-medium">Fout: {error}</p>}
        {notification && (
          <div className="fixed top-4 right-4 z-[100] bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-semibold animate-[slideIn_0.3s_ease-out]">
            {notification}
          </div>
        )}

        {/* Handmatig toevoegen */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Handmatig product toevoegen</h2>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
              <input
                type="text"
                placeholder="Zoek product…"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 mb-2"
              />
              <select
                value={manualProductId}
                onChange={(e) => setManualProductId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900"
              >
                <option value="">— Kies een product —</option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.unit === "KILO" ? "(kg)" : "(st)"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Aantal (pakbon)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={manualQty}
                onChange={(e) => setManualQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stuks per pak</label>
              <input
                type="number"
                min={1}
                step={1}
                value={manualUPB}
                onChange={(e) => setManualUPB(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prijs/st (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={manualUnitPrice}
                onChange={(e) => setManualUnitPrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={addManualItem}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold hover:brightness-110 transition shadow-md"
            >
              Toevoegen aan pakbon
            </button>
          </div>
        </div>

        {/* Upload sectie */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Pakbon scannen met AI</h2>
          <p className="text-sm text-slate-600 mb-4">Upload een foto of scan van je pakbon. AI herkent automatisch alle producten, aantallen en prijzen.</p>
          <div className="flex items-center gap-3">
            <label className="flex-1 cursor-pointer">
              <input type="file" accept="image/*" onChange={handleFileUpload} disabled={processing} className="hidden" />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition">
                <div className="text-4xl mb-2">🤖📄</div>
                <div className="text-sm font-medium text-slate-900">{processing ? "AI is bezig met analyseren..." : "Klik om pakbon te uploaden"}</div>
                <div className="text-xs text-slate-500 mt-1">JPG of PNG • AI powered</div>
              </div>
            </label>
          </div>
        </div>

        {/* Preview */}
        {uploadedImage && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Gescande pakbon</h3>
              <button onClick={clearScan} className="text-sm text-red-600 hover:text-red-700 font-medium">Wissen</button>
            </div>
            <img src={uploadedImage} alt="Pakbon scan" className="w-full max-w-2xl mx-auto rounded-lg border border-gray-200" />
          </div>
        )}

        {/* Onbekende producten - matching nodig */}
        {unmatchedItems.length > 0 && (
          <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-6 shadow-sm mb-6">
            <h2 className="text-xl font-semibold text-orange-900 mb-4">⚠️ Producten koppelen ({unmatchedItems.length})</h2>
            <p className="text-sm text-orange-700 mb-4">Deze producten zijn herkend maar niet automatisch gekoppeld. Kies het juiste product uit de suggesties:</p>
            <div className="space-y-4">
              {unmatchedItems.map((unmatched, idx) => (
                <div key={idx} className="rounded-lg border border-orange-200 bg-white p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-slate-900 text-lg">"{unmatched.scanned_name}"</div>
                      <div className="text-sm text-slate-600">Aantal: {unmatched.quantity} • Prijs: € {unmatched.price.toFixed(2)}</div>
                    </div>
                    <button onClick={() => skipUnmatched(idx)} className="text-sm text-slate-500 hover:text-slate-700">Overslaan</button>
                  </div>
                  {unmatched.suggestions.length > 0 ? (
                    <>
                      <div className="text-sm font-medium text-slate-700 mb-2">Selecteer het juiste product:</div>
                      <div className="grid gap-2">
                        {unmatched.suggestions.map((suggestion) => (
                          <button key={suggestion.id} onClick={() => selectMatch(idx, suggestion)} className="text-left px-3 py-2 rounded border border-gray-200 hover:border-green-400 hover:bg-green-50 transition">
                            <div className="font-medium text-slate-900">{suggestion.name}</div>
                            <div className="text-xs text-slate-500">{suggestion.unit === "KILO" ? "Per kilo" : "Per stuk"} • Voorraad: {suggestion.stock_quantity ?? 0}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-600 italic">Geen passende producten gevonden. Overslaan of handmatig toevoegen.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gekoppelde items lijst */}
        {items.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Herkende producten ({items.length})</h2>
              <p className="text-sm text-slate-600">Pas "Stuks per pak" of "Totaal stuks" aan</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Leverancier (optioneel)</label>
                <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="bijv. Fresh Food Centraal" className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Product</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Aantal (pakbon)</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Stuks per pak</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Totaal stuks</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Prijs/st (€)</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Subtotaal (€)</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-slate-900 font-medium">{item.product_name}</td>
                      <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" step="1" value={item.units_per_box} onChange={(e) => updateUnitsPerBox(idx, Number(e.target.value))} className="w-20 border border-gray-300 rounded px-2 py-1 bg-white text-slate-900" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" step="1" value={item.actual_quantity} onChange={(e) => updateActualQuantity(idx, Number(e.target.value))} className="w-20 border border-gray-300 rounded px-2 py-1 bg-white text-slate-900 font-semibold" />
                      </td>
                      <td className="px-3 py-2 text-slate-700">€ {item.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-900 font-semibold">€ {item.line_total.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(idx)} className="text-sm text-red-600 hover:text-red-700 font-medium">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="border-t border-gray-200">
                    <td colSpan={5} className="px-3 py-2 text-right text-slate-700">Subtotaal:</td>
                    <td className="px-3 py-2 text-slate-900 font-semibold">€ {totalAmount.toFixed(2)}</td>
                    <td></td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td colSpan={5} className="px-3 py-2 text-right text-slate-700">BTW (9%):</td>
                    <td className="px-3 py-2 text-slate-900 font-semibold">€ {btwAmount.toFixed(2)}</td>
                    <td></td>
                  </tr>
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={5} className="px-3 py-2 text-right text-slate-900 font-bold text-base">Totaal incl. BTW:</td>
                    <td className="px-3 py-2 text-slate-900 font-bold text-base">€ {totalInclBtw.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <button onClick={savePurchaseOrder} disabled={saving} className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-md">
              {saving ? "Opslaan…" : unmatchedItems.length > 0 ? `Opslaan (${unmatchedItems.length} niet gekoppeld)` : "Pakbon opslaan"}
            </button>
          </div>
        )}

        {/* Geschiedenis */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Recente pakbonnen</h2>
          {orders.length === 0 ? (
            <p className="text-slate-600 text-sm">Nog geen pakbonnen ingevoerd.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => {
                const date = new Date(order.created_at);
                const dateStr = date.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
                const timeStr = date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
                return (
                  <button key={order.id} onClick={() => loadOrderDetails(order.id)} className={`w-full flex items-center justify-between p-3 rounded-lg border transition ${selectedOrderId === order.id ? "border-green-400 bg-green-50 shadow-md" : "border-gray-200 hover:border-green-300 hover:shadow-md bg-white"}`}>
                    <div className="text-left">
                      <div className="font-medium text-slate-900">{dateStr} — {timeStr}</div>
                      {order.supplier && <div className="text-sm text-slate-600">{order.supplier}</div>}
                    </div>
                    <div className="text-lg font-bold text-slate-900">€ {order.total_amount.toFixed(2)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pakbon details */}
        {selectedOrderId && selectedOrderItems.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Pakbon details</h2>
              <div className="flex items-center gap-3">
                <button onClick={() => deleteOrder(selectedOrderId)} className="px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 transition text-sm font-medium">Verwijderen</button>
                <button onClick={() => { setSelectedOrderId(null); setSelectedOrderItems([]); }} className="text-sm text-green-600 hover:text-green-700 font-medium">Sluiten</button>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Product</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Aantal (pakbon)</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Stuks per pak</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Totaal stuks</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Prijs/st (€)</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Subtotaal (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-slate-900 font-medium">{item.product_name}</td>
                      <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-2 text-slate-700">{item.units_per_box}</td>
                      <td className="px-3 py-2 text-slate-900 font-semibold">{item.actual_quantity}</td>
                      <td className="px-3 py-2 text-slate-700">€ {item.unit_price.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-900 font-semibold">€ {item.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right text-slate-900 font-semibold">Totaal:</td>
                    <td className="px-3 py-2 text-slate-900 font-bold">€ {selectedOrderItems.reduce((s, i) => s + i.line_total, 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
