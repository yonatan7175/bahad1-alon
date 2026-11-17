import type { NextConfig } from "next";

// CSP for contributed simple-app files (plan 10). `sandbox` forces an opaque
// origin even when a file is opened directly (outside the portal's iframe), so
// app code can never read the portal's cookies or storage. No external hosts:
// connect/img/font/media are limited to the app's own files (+ data:/blob:).
export const SIMPLE_APP_CSP = [
  "sandbox allow-scripts allow-forms allow-popups",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `pnpm dev` blocks its own scripts for any host but localhost unless listed here, which
  // leaves pages dead (no buttons work). Set BAHAD_DEV_ORIGINS=100.x.y.z,192.168.1.171 in .env.local
  // when opening the dev server from a phone / Tailscale. Dev only — ignored by production builds.
  allowedDevOrigins: (process.env.BAHAD_DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  // The security tests build into a separate folder so their test-only apps never end up in .next.
  ...(process.env.BAHAD_DIST_DIR ? { distDir: process.env.BAHAD_DIST_DIR } : {}),
  // Self-hosting on Linux: BAHAD_STANDALONE=1 pnpm build → .next/standalone (see LINUX.md).
  ...(process.env.BAHAD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["@electric-sql/pglite", "pg", "web-push"],
  outputFileTracingIncludes: {
    "/**": ["./supabase/migrations/*.sql", "./supabase/local/*.sql"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/apps/:path*",
        headers: [
          { key: "Content-Security-Policy", value: SIMPLE_APP_CSP },
          { key: "Cache-Control", value: "no-cache" },
          // A sandboxed app has an opaque origin, so fetching its OWN files (e.g. data.json) is a CORS request.
          // These are public static files; no credentials are ever allowed.
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      { source: "/app-icons/:path*", headers: [{ key: "Content-Security-Policy", value: SIMPLE_APP_CSP }] },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // Fonts are always fetched in CORS mode; sandboxed apps have an opaque origin.
        source: "/fonts/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      { source: "/bahad.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/bahad.css", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
