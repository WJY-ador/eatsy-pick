import Link from "next/link";
import { Suspense } from "react";
import { ExploreLink, ExploreLinkBase, HeaderSearch, SearchForm } from "@/components/home/HeaderSearch";
import { EXTERNAL_GEOCODE_ON, GEOCODE_CREDIT } from "@/lib/geocode";
import { ATTRIBUTION, DATA_SOURCE, DISCLAIMER, SITE_NAME } from "@/lib/site";
import { RecordsButton } from "./Records";
import { TopFold } from "./TopFold";

/** 모든 화면의 상단 고정 바: 로고, 통합 검색, 맛집 둘러보기, 내 저장, 상권 랭킹. 768px 미만은 아래로 스크롤하면 검색창 줄만 남긴다 */
export function SiteHeader() {
  return (
    <header className="top">
      <div className="top__in">
        <Link className="wordmark" prefetch={false} href="/" aria-label={`${SITE_NAME} 처음으로`}>
          {SITE_NAME}
        </Link>
        <div className="top__search">
          <Suspense fallback={<SearchForm />}>
            <HeaderSearch />
          </Suspense>
        </div>
        <nav className="top__nav" aria-label="주요 화면">
          <Suspense fallback={<ExploreLinkBase />}>
            <ExploreLink />
          </Suspense>
          <RecordsButton />
          <Link className="top__link" prefetch={false} href="/area">
            상권 랭킹
          </Link>
        </nav>
      </div>
      <TopFold />
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
        {EXTERNAL_GEOCODE_ON ? <p className="foot__src">{GEOCODE_CREDIT}</p> : null}
        <p className="foot__links">
          <Link className="foot__link" prefetch={false} href="/area">
            상권별 결제 랭킹
          </Link>
          <Link className="foot__link" prefetch={false} href="/privacy">
            개인정보 안내
          </Link>
        </p>
      </div>
    </footer>
  );
}
