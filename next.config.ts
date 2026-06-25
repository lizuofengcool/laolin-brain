import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // 压缩优化
  compress: true,
  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // 优化打包
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'recharts',
      'framer-motion',
      'zustand',
      'clsx',
      'tailwind-merge',
    ],
    // 优化内存使用
    workerThreads: true,
    // 优化字体加载
    optimizeCss: true,
  },
  serverExternalPackages: ['sharp'],
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    const cspValue = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https: wss: ws: http://localhost:*; frame-ancestors 'none';"
      : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https: wss:; frame-ancestors 'none';";

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          ...(isDev ? [] : [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]),
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: cspValue,
          },
        ],
      },
    ];
  },
};

// Enable bundle analyzer when ANALYZE=true env var is set
export default process.env.ANALYZE === "true"
  ? withBundleAnalyzer({
      enabled: true,
    })(nextConfig)
  : nextConfig;
