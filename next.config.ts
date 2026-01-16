import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase body size limit for large document uploads (legal briefs can be 50MB+)
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
