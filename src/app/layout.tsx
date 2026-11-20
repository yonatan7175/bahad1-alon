import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { SITE_NAME } from "@/lib/site";
import { ToastProvider } from "@/components/toast";
import { Footer } from "@/components/footer";
import { OfflineBanner } from "@/components/offline-banner";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "צ1 — כל הכלים של גדוד אלון, בה״ד 1, במקום אחד",
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f8" },
    { media: "(prefers-color-scheme: dark)", color: "#070b14" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Theme is a cookie read on the server, so there is no flash and no inline script.
  const theme = (await cookies()).get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang="he" dir="rtl" data-theme={dataTheme} className="h-full antialiased">
      <head>
        <link rel="preload" href="/fonts/heebo-hebrew.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <OfflineBanner />
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
