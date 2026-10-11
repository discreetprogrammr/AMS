/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Server Actions default to a 1 MB request body, which rejects most
    // photos and PDFs on the document upload (app/assets/[id]/documents-
    // actions.ts). Vercel's own cap on a request body is 4.5 MB, so 4 MB is
    // the most that can work in production; the upload form checks the same.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
