import QRCode from "qrcode";

// Server-side QR generation (Node's Canvas-free "qrcode" package, not a
// browser API) — runs directly inside a Server Component during render, so
// the image ships to the browser as a plain <img> data URL with zero extra
// client-side JS needed just to show a code. Used by the asset detail page
// to print a scannable tag per asset (app/assets/scan is the matching
// in-app camera reader for the other end of this).
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 2,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}
