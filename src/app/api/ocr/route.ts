import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Server-side OCR: de OpenAI key blijft hier op de server en wordt
// nooit naar de browser gestuurd.
const PROMPT = `Je bent een assistent voor een groenteboer. Analyseer deze pakbon/leveringsbon en extraheer:
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
- Als geen totaalbedrag zichtbaar is, zet total_amount op 0`;

export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "OPENAI_API_KEY ontbreekt op de server." },
            { status: 500 }
        );
    }

    let image: string;
    try {
        const body = await req.json();
        image = body.image;
        if (typeof image !== "string" || !image.startsWith("data:image/")) {
            return NextResponse.json(
                { error: "Geen geldige afbeelding ontvangen." },
                { status: 400 }
            );
        }
    } catch {
        return NextResponse.json(
            { error: "Ongeldige aanvraag." },
            { status: 400 }
        );
    }

    try {
        const openai = new OpenAI({ apiKey });
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: PROMPT },
                        { type: "image_url", image_url: { url: image } },
                    ],
                },
            ],
            max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content?.trim() || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json(
                { error: "AI kon geen producten herkennen op de foto. Probeer een scherpere foto of voer handmatig in." },
                { status: 422 }
            );
        }

        let parsed: { items?: unknown; total_amount?: unknown };
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch {
            return NextResponse.json(
                { error: "AI-antwoord kon niet gelezen worden. Probeer het opnieuw." },
                { status: 422 }
            );
        }

        return NextResponse.json({
            items: Array.isArray(parsed.items) ? parsed.items : [],
            total_amount: typeof parsed.total_amount === "number" ? parsed.total_amount : 0,
        });
    } catch (err) {
        console.error("OCR error:", err);
        return NextResponse.json(
            { error: "Foto-analyse mislukt. Controleer je verbinding en probeer opnieuw." },
            { status: 502 }
        );
    }
}
