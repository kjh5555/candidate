import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "내 지역구 의원 보기",
  description:
    "국회의원과 광역의회 의원의 프로필·발의 법안·표결 이력을 지역별로 조회하는 웹 서비스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="min-h-screen bg-slate-50 font-[family-name:var(--font-noto)]">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-bold text-slate-800 text-lg hover:text-blue-600 transition-colors">
              의원정보
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-blue-600 transition-colors">
                지역구 검색
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-400">
          <p>의원정보 서비스 · 공공데이터 기반</p>
        </footer>
      </body>
    </html>
  );
}
