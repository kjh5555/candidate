"use client";

import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Landmark } from "lucide-react";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto",
  display: "swap",
});

const NAV_LINKS = [
  { href: "/", label: "홈" },
  { href: "/?tab=national", label: "의원", matcher: /^\/(region|legislator|provincial)/ },
  { href: "/?tab=local", label: "후보", matcher: /^\/(candidate)/ },
  { href: "/budget", label: "예산" },
  { href: "/about", label: "제도 알아보기" },
] as const;

function NavLink({
  href,
  label,
  matcher,
  onClick,
}: {
  href: string;
  label: string;
  matcher?: RegExp;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive =
    (href === "/" && pathname === "/") ||
    (matcher && matcher.test(pathname)) ||
    (href !== "/" && !matcher && pathname.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative px-1 py-0.5 text-sm font-medium transition-colors after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:rounded-full after:transition-transform after:duration-200 ${
        isActive
          ? "text-blue-700 after:bg-blue-700 after:scale-x-100"
          : "text-slate-600 hover:text-slate-900 after:bg-blue-700 after:scale-x-0 hover:after:scale-x-100"
      }`}
    >
      {label}
    </Link>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-14 flex items-center justify-between gap-6">
          {/* Wordmark */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-slate-900 hover:text-blue-700 transition-colors shrink-0"
          >
            <Landmark className="w-5 h-5 text-blue-700" />
            <span className="text-base tracking-tight">열린의회</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.label} {...link} />
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="메뉴 열기"
            className="sm:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-slate-100 bg-white">
          <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="min-h-screen bg-slate-50 font-[family-name:var(--font-noto)]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 mt-16 py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p className="font-medium text-slate-500">열린의회</p>
            <p>공공데이터 기반 시민 정보 서비스 · 비영리</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
