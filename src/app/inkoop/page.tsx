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
  matched: boolean;
  confidence: "high" | "low"; // nieuw: confidence level
};

type UnmatchedItem = {
  scanned_name: string;
  quantity: number;
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
};

type ScannedItem = {
  product_name: string;
  quantity: number;
  confidence: number; // 0-1 score van AI
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
  const [totalAmount, setTotalAmount] = useState<number>(0); // handmatig invoeren
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
        const { data: productData } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();

        if (productData) {
          const newStock = (productData.stock_quantity ?? 0) - item.actual_quantity;
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

      setNotification("Pakbon succesvol verwijderd en voorraad bijgewerkt");
      setSelectedOrderId(null);
      setSelectedOrderItems([]);
      loadOrders();
      loadProducts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ---------- Image scanning ----------
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setUploadedImage(base64);

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Je bent een assistent voor een groenteboer. Analyseer deze pakbon/leveringsbon en extraheer:
1. ALLE producten met hun aantallen (aantal dozen/pakken)
2. Het TOTAALBEDRAG (onderaan de bon, meestal "Totaal" of "Te betalen")
3. Geef voor elk product een confidence score (0-1) over hoe zeker je bent van de match

Retourneer alleen JSON in dit formaat:
{
  "items": [
    {"product_name": "naam", "quantity": aantal, "confidence": 0.95}
  ],
  "total_amount": 123.45
}

Let op:
- Hoeveelheden kunnen zijn: "2x", "3 st", "5 doos", etc.
- Probeer productnamen te normaliseren (bijv. "Tomaten" i.p.v. "Tom.")
- Als je onzeker bent over een product, geef lagere confidence (<0.7)
- Als geen totaalbedrag zichtbaar is, zet total_amount op 0`,
                },
                {
                  type: "image_url",
                  image_url: { url: base64 },
                },
              ],
            },
          ],
          max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content?.trim() || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          throw new Error("Geen geldige JSON teruggekregen van AI");
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const scannedItems: ScannedItem[] = parsed.items || [];
        const scannedTotal = parsed.total_amount || 0;

        // Zet totaal bedrag
        setTotalAmount(scannedTotal);

        // Match producten
        const matched: PurchaseItem[] = [];
        const unmatched: UnmatchedItem[] = [];

        for (const scanned of scannedItems) {
          const bestMatch = findBestMatch(scanned.product_name);
          const confidence = scanned.confidence >= 0.7 ? "high" : "low";

          if (bestMatch && scanned.confidence >= 0.7) {
            // Hoge confidence - automatisch matchen
            matched.push({
              product_id: bestMatch.id,
              product_name: bestMatch.name,
              quantity: scanned.quantity,
              units_per_box: 1,
              actual_quantity: scanned.quantity,
              matched: true,
              confidence: "high",
            });
          } else {
            // Lage confidence - gebruiker moet kiezen
            const suggestions = findSimilarProducts(scanned.product_name, 5);
            unmatched.push({
              scanned_name: scanned.product_name,
              quantity: scanned.quantity,
              suggestions,
            });
          }
        }

        setItems(matched);
        setUnmatchedItems(unmatched);
        setNotification(`${matched.length} producten herkend, ${unmatched.length} ter controle`);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || "Fout bij verwerken foto");
    } finally {
      setProcessing(false);
    }
  }

  // ---------- Product matching ----------
  function findBestMatch(scannedName: string): Product | null {
    const normalized = scannedName.toLowerCase().trim();
    
    // Exacte match
    let match = products.find((p) => 
      p.name.toLowerCase().trim() === normalized
    );
    if (match) return match;

    // Bevat match
    match = products.find((p) => 
      p.name.toLowerCase().includes(normalized) || 
      normalized.includes(p.name.toLowerCase())
    );
    if (match) return match;

    // Fuzzy match op eerste woord
    const firstWord = normalized.split(/\s+/)[0];
    match = products.find((p) => 
      p.name.toLowerCase().startsWith(firstWord) ||
      firstWord.startsWith(p.name.toLowerCase().split(/\s+/)[0])
    );
    
    return match || null;
  }

  function findSimilarProducts(scannedName: string, limit: number): Product[] {
    const normalized = scannedName.toLowerCase();
    
    const scored = products.map((p) => {
      const productName = p.name.toLowerCase();
      let score = 0;

      // Exacte match
      if (productName === normalized) score += 100;
      
      // Bevat elkaar
      if (productName.includes(normalized)) score += 50;
      if (normalized.includes(productName)) score += 50;
      
      // Eerste woord match
      const scanWords = normalized.split(/\s+/);
      const prodWords = productName.split(/\s+/);
      if (scanWords[0] === prodWords[0]) score += 30;
      
      // Levenshtein distance (simplified)
      const maxLen = Math.max(normalized.length, productName.length);
      const distance = levenshteinDistance(normalized, productName);
      score += Math.max(0, 20 - (distance / maxLen) * 20);

      return { product: p, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.product);
  }

  function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // ---------- Item management ----------
  function selectMatch(unmatchedIdx: number, product: Product) {
    const unmatched = unmatchedItems[unmatchedIdx];
    
    const newItem: PurchaseItem = {
      product_id: product.id,
      product_name: product.name,
      quantity: unmatched.quantity,
      units_per_box: 1,
      actual_quantity: unmatched.quantity,
      matched: true,
      confidence: "low", // Was onzeker, nu door gebruiker bevestigd
    };

    setItems([...items, newItem]);
    setUnmatchedItems(unmatchedItems.filter((_, i) => i !== unmatchedIdx));
    setNotification(`${product.name} toegevoegd`);
  }

  function skipUnmatched(idx: number) {
    setUnmatchedItems(unmatchedItems.filter((_, i) => i !== idx));
  }

  function updateUnitsPerBox(idx: number, value: number) {
    const updated = [...items];
    updated[idx].units_per_box = value;
    updated[idx].actual_quantity = updated[idx].quantity * value;
    setItems(updated);
  }

  function updateActualQuantity(idx: number, value: number) {
    const updated = [...items];
    updated[idx].actual_quantity = value;
    setItems(updated);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  // Handmatig product toevoegen
  function addManualProduct() {
    if (!manualProductId) {
      setError("Selecteer een product");
      return;
    }

    const product = products.find((p) => p.id === manualProductId);
    if (!product) return;

    const actualQty = manualQty * manualUPB;

    const newItem: PurchaseItem = {
      product_id: product.id,
      product_name: product.name,
      quantity: manualQty,
      units_per_box: manualUPB,
      actual_quantity: actualQty,
      matched: true,
      confidence: "high",
    };

    setItems([...items, newItem]);
    setManualProductId("");
    setManualQty(1);
    setManualUPB(1);
    setManualSearch("");
    setNotification(`${product.name} handmatig toegevoegd`);
  }

  // ---------- Save ----------
  async function savePurchaseOrder() {
    if (items.length === 0) {
      setError("Voeg minimaal 1 product toe");
      return;
    }

    if (totalAmount <= 0) {
      setError("Voer een totaalbedrag in");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Maak purchase order
      const { data: orderData, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          supplier: supplier || null,
          total_amount: totalAmount,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      const orderId = orderData.id;

      // Voeg items toe (zonder individuele prijzen)
      const orderItems = items.map((item) => ({
        purchase_order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        units_per_box: item.units_per_box,
        actual_quantity: item.actual_quantity,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Update voorraad
      for (const item of items) {
        const { data: productData } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();

        if (productData) {
          const newStock = (productData.stock_quantity ?? 0) + item.actual_quantity;
          await supabase
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", item.product_id);
        }
      }

      setNotification("Pakbon succesvol opgeslagen!");
      
      // Reset form
      setItems([]);
      setUnmatchedItems([]);
      setSupplier("");
      setTotalAmount(0);
      setUploadedImage(null);
      
      loadOrders();
      loadProducts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- Computed ----------
  const filteredProducts = useMemo(() => {
    if (!manualSearch) return products;
    const search = manualSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(search));
  }, [products, manualSearch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-orange-50 to-red-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Inkoop</h1>
        </div>

        {/* Notifications */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        )}
        {notification && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-green-800 font-medium">{notification}</p>
          </div>
        )}

        {/* Upload sectie */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Pakbon scannen</h2>
          
          <label className="block cursor-pointer">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-green-400 hover:bg-green-50 transition">
              {processing ? (
                <div className="text-slate-600">
                  <div className="animate-spin inline-block w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mb-2"></div>
                  <p>Pakbon analyseren...</p>
                </div>
              ) : uploadedImage ? (
                <div>
                  <p className="text-green-600 font-medium mb-2">✓ Pakbon geüpload</p>
                  <p className="text-sm text-slate-600">Upload opnieuw om te vervangen</p>
                </div>
              ) : (
                <div>
                  <p className="text-slate-900 font-medium mb-1">📸 Foto van pakbon uploaden</p>
                  <p className="text-sm text-slate-600">De AI herkent automatisch producten en bedragen</p>
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={processing}
            />
          </label>

          {uploadedImage && (
            <div className="mt-4">
              <img src={uploadedImage} alt="Pakbon" className="max-w-full max-h-64 mx-auto rounded-lg border border-gray-200" />
            </div>
          )}
        </div>

        {/* Handmatig product toevoegen */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Handmatig product toevoegen</h2>
          
          <div className="grid md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Zoek product</label>
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="Type om te zoeken..."
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
              />
              {manualSearch && filteredProducts.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded">
                  {filteredProducts.slice(0, 10).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setManualProductId(p.id);
                        setManualSearch(p.name);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.unit} • Voorraad: {p.stock_quantity ?? 0}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Aantal (pakbon)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={manualQty}
                onChange={(e) => setManualQty(Number(e.target.value))}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stuks per pak</label>
              <input
                type="number"
                min="1"
                step="1"
                value={manualUPB}
                onChange={(e) => setManualUPB(Number(e.target.value))}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={addManualProduct}
                disabled={!manualProductId}
                className="w-full py-2 rounded bg-green-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition"
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>

        {/* Onzekere matches ter controle */}
        {unmatchedItems.length > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-orange-900 mb-2">⚠️ Producten ter controle ({unmatchedItems.length})</h2>
            <p className="text-sm text-orange-700 mb-4">De AI was onzeker over deze producten. Selecteer het juiste product of sla over.</p>
            
            <div className="space-y-4">
              {unmatchedItems.map((unmatched, idx) => (
                <div key={idx} className="rounded-xl border border-orange-300 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-semibold text-slate-900 text-lg">{unmatched.scanned_name}</div>
                      <div className="text-sm text-slate-600">Aantal: {unmatched.quantity}</div>
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
              <h2 className="text-xl font-semibold text-slate-900">Producten op pakbon ({items.length})</h2>
              <p className="text-sm text-slate-600">Pas aantallen aan indien nodig</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Leverancier (optioneel)</label>
                <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="bijv. Fresh Food Centraal" className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Totaalbedrag pakbon (€) <span className="text-red-500">*</span>
                </label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={totalAmount} 
                  onChange={(e) => setTotalAmount(Number(e.target.value))} 
                  placeholder="123.45" 
                  className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-semibold text-lg"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Product</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Status</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Aantal (pakbon)</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Stuks per pak</th>
                    <th className="px-3 py-2 text-left text-slate-900 font-semibold">Totaal stuks</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-slate-900 font-medium">{item.product_name}</td>
                      <td className="px-3 py-2">
                        {item.confidence === "high" ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            ✓ Zeker
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                            ⚠ Handmatig
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" step="1" value={item.units_per_box} onChange={(e) => updateUnitsPerBox(idx, Number(e.target.value))} className="w-20 border border-gray-300 rounded px-2 py-1 bg-white text-slate-900" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" step="1" value={item.actual_quantity} onChange={(e) => updateActualQuantity(idx, Number(e.target.value))} className="w-20 border border-gray-300 rounded px-2 py-1 bg-white text-slate-900 font-semibold" />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(idx)} className="text-sm text-red-600 hover:text-red-700 font-medium">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="text-lg">
                <span className="text-slate-600">Totaalbedrag pakbon:</span>
                <span className="ml-2 text-2xl font-bold text-slate-900">€ {totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <button onClick={savePurchaseOrder} disabled={saving || totalAmount <= 0} className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 via-orange-400 to-red-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 transition shadow-md">
              {saving ? "Opslaan…" : unmatchedItems.length > 0 ? `Opslaan (${unmatchedItems.length} nog ter controle)` : "Pakbon opslaan"}
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
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-slate-900 font-medium">{item.product_name}</td>
                      <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-2 text-slate-700">{item.units_per_box}</td>
                      <td className="px-3 py-2 text-slate-900 font-semibold">{item.actual_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}