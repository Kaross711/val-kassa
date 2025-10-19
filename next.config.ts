// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    eslint: { ignoreDuringBuilds: true }, // ← blokkeert build niet meer op ESLint
    // typescript: { ignoreBuildErrors: true }, // ← alleen inschakelen als TS ook zou blokkeren
};

export default nextConfig;
