import Link from "next/link";
import { ATTRIBUTION, DATA_SOURCE, DISCLAIMER, SITE_NAME } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="top container container--narrow">
      <Link className="wordmark" prefetch={false} href="/" aria-label={`${SITE_NAME} 처음으로`}>
        {SITE_NAME}
      </Link>
      <nav className="top__nav" aria-label="주요 화면">
        <Link className="top__link" prefetch={false} href="/">
          근처 후보
        </Link>
        <Link className="top__link" prefetch={false} href="/analysis">
          상권 분석
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="container container--narrow foot__inner">
        <p className="foot__attr">{ATTRIBUTION}</p>
        <p className="foot__disc">{DISCLAIMER}</p>
        <p className="foot__src">{DATA_SOURCE}</p>
        <p>
          <Link className="foot__link" prefetch={false} href="/area">
            상권별 결제 랭킹
          </Link>
        </p>
      </div>
    </footer>
  );
}
