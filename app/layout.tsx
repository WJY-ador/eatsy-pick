import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { InappBanner } from "@/components/InappBanner";
import { RecordsSheet } from "@/components/Records";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE_DESCRIPTION, SITE_NAME, shareImages, shareTwitterImages, siteUrl } from "@/lib/site";

// 서체는 Pretendard Variable 한 가족(dynamic subset CSS). 숫자는 tabular-nums로 맞춘다.

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    images: shareImages(SITE_NAME),
  },
  twitter: { card: "summary_large_image", images: shareTwitterImages(SITE_NAME) },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <a className="skip" href="#main">
          본문으로 건너뛰기
        </a>
        <InappBanner />
        <SiteHeader />
        {children}
        <SiteFooter />
        <RecordsSheet />
      </body>
    </html>
  );
}
