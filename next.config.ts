import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // 해커톤 기간 동안 lint 때문에 빌드가 막히지 않도록.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
