import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { InstallPrompt } from "@/components/install-prompt";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HorizonCare360 — Pacific Horizon Tek",
  description:
    "OEM-independent lifecycle asset management for NII & detection equipment.",
  // Installable PWA — manifest.webmanifest (public/) lists the icons/name/
  // start_url; these two fields are what actually get Chrome/Edge/Android
  // to recognize the app as installable and iOS Safari to use the right
  // icon for "Add to Home Screen".
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HorizonCare360",
  },
};

// themeColor/colorScheme live in a separate `viewport` export as of
// Next.js 13.4+ (metadata itself no longer accepts them) — this is what
// colors the mobile browser chrome/status bar to match the app's dark
// theme instead of showing a default white bar above the installed app.
export const viewport: Viewport = {
  themeColor: "#05070D",
};

// Runs before hydration so the .light class (if the user picked light mode
// last time) is applied before first paint — otherwise the page would
// flash dark, then snap to light once React mounts and reads localStorage.
const themeInitScript = `
(function () {
  try {
    if (localStorage.getItem("hc360-theme") === "light") {
      document.documentElement.classList.add("light");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-base font-sans text-ink antialiased transition-colors">
        <PwaRegister />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}
