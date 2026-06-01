import type { MetadataRoute } from "next";

const SITE_URL = "https://handspolitics.co.kr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 네이버·구글 기본 크롤러 모두 허용.
        // API 호출 경로는 사이트가 직접 노출하지 않으므로 차단 불필요.
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
