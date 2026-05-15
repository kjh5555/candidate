import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.assembly.go.kr",
        pathname: "/photo/**",
      },
      {
        protocol: "https",
        hostname: "www.assembly.go.kr",
        pathname: "/static/portal/img/openassm/**",
      },
      {
        protocol: "https",
        hostname: "clik.nanet.go.kr",
        pathname: "/clikr-collection/**",
      },
    ],
  },
};

export default nextConfig;
