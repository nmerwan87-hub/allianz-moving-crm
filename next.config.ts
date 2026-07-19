import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["puppeteer-core"],
}

export default nextConfig
