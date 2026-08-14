import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 부터 next build 중 ESLint 를 돌리지 않는다.
  // (이전에 있던 eslint.ignoreDuringBuilds 는 더 이상 유효한 키가 아니라 제거)
};

export default nextConfig;
