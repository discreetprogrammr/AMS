import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HorizonCare360 — Pacific Horizon Tek",
  description:
    "OEM-independent lifecycle asset management for NII & detection equipment.",
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
        {children}
      </body>
    </html>
  );
}
