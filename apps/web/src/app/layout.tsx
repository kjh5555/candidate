import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { MyRegionBanner } from "@/components/MyRegionBanner";
import { SiteHeader } from "@/components/SiteHeader";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
  display: "swap",
});

const SITE_URL = "https://handspolitics.co.kr";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "손안에정치 — 내 의원·내 예산·6.3 지방선거",
    template: "%s · 손안에정치",
  },
  description:
    "내 지역 의원·예산·법안·6.3 지방선거 후보·정당을 5분 안에 확인하세요. 국회·NEC·지방재정365·CLIK 공공데이터 기반 비영리 시민 정보 서비스.",
  keywords: [
    "손안에정치",
    "지방선거",
    "2026 지방선거",
    "6.3 지방선거",
    "국회의원 정보",
    "광역의원",
    "기초의원",
    "시·도지사 후보",
    "교육감 후보",
    "정당 정보",
    "지방재정",
    "지역 예산",
    "공약 정보",
    "본예산",
    "결산",
    "시민 거버넌스",
  ],
  applicationName: "손안에정치",
  authors: [{ name: "손안에정치" }],
  creator: "손안에정치",
  publisher: "손안에정치",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "손안에정치",
    title: "손안에정치 — 내 의원·내 예산·6.3 지방선거",
    description:
      "내 지역 의원·예산·후보·정당을 5분 안에 확인. 국회·NEC·지방재정365·CLIK 공공데이터 기반 시민 정보 서비스.",
  },
  twitter: {
    card: "summary_large_image",
    title: "손안에정치 — 내 의원·내 예산·6.3 지방선거",
    description:
      "내 지역 의원·예산·후보·정당을 5분 안에 확인. 공공데이터 기반 비영리 시민 정보 서비스.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // 등록 후 추가:
    //   google: "GOOGLE_VERIFY_TOKEN",
    //   other: { "naver-site-verification": "NAVER_VERIFY_TOKEN" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#031635",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="min-h-screen bg-[#f8f9fa] font-[family-name:var(--font-noto)]">
        <SiteHeader />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <MyRegionBanner />
          {children}
        </main>
        <footer className="border-t border-slate-200 mt-16 py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p className="font-medium text-slate-500">손안에정치</p>
            <p>공공데이터 기반 시민 정보 서비스 · 비영리</p>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
