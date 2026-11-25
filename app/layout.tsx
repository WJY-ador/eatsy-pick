import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { InappRedirect } from "@/components/InappRedirect";
import { RecordsSheet } from "@/components/Records";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE_DESCRIPTION, SITE_NAME, shareImages, shareTwitterImages, siteUrl } from "@/lib/site";

// 서체는 Pretendard Variable 한 가족(dynamic subset CSS). 숫자는 tabular-nums로 맞춘다.

// GA4(spec.md 홍보 유입과 잇플 클릭 측정). 측정 ID는 Vercel Production에만 등록돼 있어 로컬과 프리뷰는 태그를 싣지 않는다.
// @next/third-parties가 없어 next/script로 gtag.js와 config를 한 번 싣는다(root layout이라 경로를 옮겨도 다시 싣지 않는다).
// 페이지 조회(브라우저 기록 기반 페이지 변경 포함)와 외부 링크 클릭은 GA4 향상된 측정에 맡긴다.
// 앱에서 page_view, click, eatpl_click을 따로 보내지 않고 config 옵션도 바꾸지 않는다(중복 방지).
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
        <InappRedirect />
        <SiteHeader />
        {children}
        <SiteFooter />
        <RecordsSheet />
        {GA_ID ? (
          <>
            <Script id="ga-init">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)});`}
            </Script>
            <Script id="ga-gtag" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} />
          </>
        ) : null}
      </body>
    </html>
  );
}
