import type { MetadataRoute } from "next";

const SITE_URL = "https://handspolitics.co.kr";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // 정적 페이지만 노출. 동적 라우트(/legislator/[id]·/candidate/[id]·
  // /parties/[name])는 너무 많아서(약 4,700개 의원 + 8,500명 후보) 추후
  // 별도 sitemap.xml 동적 라우트로 분할 가능. 현재는 인덱스 검색·발견용.
  const routes = [
    "/",
    "/legislators",
    "/candidates",
    "/parties",
    "/budget",
    "/about",
  ];
  return routes.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: p === "/" ? "daily" : "weekly",
    priority: p === "/" ? 1 : 0.7,
  }));
}
