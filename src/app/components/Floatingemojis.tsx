// app/components/Floatingemojis.tsx
"use client";

import { useEffect, useState } from "react";

const EMOJIS = [
    "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒",
    "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥬", "🥒",
    "🌶️", "🫑", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🫘", "🥜",
    "🍆", "🥗", "🥕", "🫛", "🍄"
];

type Emoji = {
    id: number;
    emoji: string;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
    animation: number; // Welke animatie variant (1-4)
};

export default function Floatingemojis() {
    const [emojis, setEmojis] = useState<Emoji[]>([]);

    useEffect(() => {
        // Genereer 12 emojis met betere spreiding
        const generated: Emoji[] = [];

        // Verdeel het scherm in een 4x3 grid voor betere spreiding
        const cols = 4;
        const rows = 3;

        for (let i = 0; i < 12; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            // Plaats in grid met wat randomness binnen elke cel
            const baseX = (col * (100 / cols)) + (Math.random() * 20);
            const baseY = (row * (100 / rows)) + (Math.random() * 25);

            generated.push({
                id: i,
                emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
                x: Math.min(95, baseX), // Zorg dat ze binnen scherm blijven
                y: Math.min(90, baseY),
                size: 30 + Math.random() * 30, // 30-60px (iets groter)
                duration: 16 + Math.random() * 8, // 16-24 seconden (sneller!)
                delay: Math.random() * 10, // 0-10 seconden delay
                opacity: 0.08 + Math.random() * 0.10, // 0.08-0.18 opacity
                animation: Math.floor(Math.random() * 4) + 1, // 1-4 (verschillende animaties)
            });
        }
        setEmojis(generated);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            {emojis.map((emoji) => (
                <div
                    key={emoji.id}
                    className={`absolute animate-float-gentle-${emoji.animation}`}
                    style={{
                        left: `${emoji.x}%`,
                        top: `${emoji.y}%`,
                        fontSize: `${emoji.size}px`,
                        opacity: emoji.opacity,
                        animationDuration: `${emoji.duration}s`,
                        animationDelay: `${emoji.delay}s`,
                    }}
                >
                    {emoji.emoji}
                </div>
            ))}
        </div>
    );
}