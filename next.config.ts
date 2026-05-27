import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

// Enable bundle analyzer when ANALYZE=true env var is set
export default process.env.ANALYZE === "true"
  ? withBundleAnalyzer({
      enabled: true,
    })(nextConfig)
  : nextConfig;
