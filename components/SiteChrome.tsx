import Link from "next/link";
import { ATTRIBUTION, DATA_SOURCE, DISCLAIMER, SITE_NAME } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="top container">
      <Link className="wordmark" href="/" aria-label={`${SITE_NAME} 처음으로`}>
        {SITE_NAME}
      </Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="container foot__inner">
        <p className="foot__attr">{ATTRIBUTION}</p>
        <p className="foot__disc">{DISCLAIMER}</p>
        <p className="foot__src">{DATA_SOURCE}</p>
        <p>
          <Link className="foot__link" href="/area">
            상권별 결제 랭킹
          </Link>
        </p>
      </div>
    </footer>
  );
}
