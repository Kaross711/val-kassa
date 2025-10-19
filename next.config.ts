// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    eslint: { ignoreDuringBuilds: true },
    // alleen als je óók typefouten wil negeren:
    // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
