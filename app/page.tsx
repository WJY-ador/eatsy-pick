import type { Metadata } from "next";
import { ControlBar } from "@/components/ControlBar";
import { getDecision } from "@/components/decision";
import { ResultsBody, ResultsHead, ResultsSkeleton } from "@/components/Results";
import { areaBySlug } from "@/lib/areas";
import { displayName } from "@/lib/format";
import { DEFAULT_OCCASION } from "@/lib/occasions";
import { type DecideInput, canonicalPath, ogPath, parseQuery, resultsTitle, toSearch } from "@/lib/query";
import { ATTRIBUTION, HELLO, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// 조회 12건, 동시 5개, 타임아웃 5초 기준 최악 약 15초. 여유를 둔다.
export const maxDuration = 30;

// 결과를 스트리밍하지 않고 첫 HTML에 넣는다(JS가 꺼진 브라우저와 단톡방 미리보기에서도 결과가 보이게).
// 그래서 이 페이지는 이동할 때 서버 응답을 기다려도 된다고 표시한다(Cache Components 정적 셸 검증 제외).
export const instant = false;

/** 쿼리 없는 '/'가 바로 그리는 기본 조건: 강남역 회식, 프랜차이즈 제외 */
const DEFAULT_INPUT: DecideInput = { area: areaBySlug("gangnam"), occ: DEFAULT_OCCASION, excludeFranchise: true, n: 1 };

/** 쿼리별 공유 메타데이터. '/'는 일반 꼴(canonical '/', 일반 OG). */
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const input = parseQuery(await searchParams);
  if (!input) {
    return {
      title: { absolute: SITE_NAME },
      description: SITE_DESCRIPTION,
      alternates: { canonical: "/" },
      openGraph: {
        type: "website",
        locale: "ko_KR",
        siteName: SITE_NAME,
        url: "/",
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: [{ url: "/og", width: 1200, height: 630, alt: SITE_NAME }],
      },
      twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION, images: ["/og"] },
    };
  }
  const d = await getDecision(input);
  const names = d.status === "ok" ? d.picks.map((c) => displayName(c.item.merNm)) : [];
  const heading = resultsTitle(input, names.length > 0 ? names.length : 3);
  const title = `${heading} | ${SITE_NAME}`;
  const description =
    names.length > 0
      ? `${names.join(", ")}. 시군구 매출 순위와 붐비는 때, 주 고객층을 봅니다. ${ATTRIBUTION}.`
      : `BC카드 결제 데이터로 고르는 ${heading}. ${ATTRIBUTION}.`;
  const canonical = canonicalPath(input);
  const image = ogPath(input);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_NAME,
      url: canonical,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: heading }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/**
 * 카피 한 줄, 상단 고정 컨트롤 바, 결과 머리줄, 결과 본문.
 * 조건을 바꾸면 소프트 내비게이션으로 이 페이지가 다시 그려지고, 서버 응답을 기다리는 동안 스켈레톤이 결과 자리에 선다.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const input = parseQuery(await searchParams) ?? DEFAULT_INPUT;
  return (
    <main id="main">
      <p className="hello container">{HELLO}</p>
      <ControlBar state={{ area: input.area?.slug, q: input.q, occ: input.occ, excludeFranchise: input.excludeFranchise }} />
      <ResultsHead input={input} />
      <ResultsSkeleton />
      <ResultsBody key={toSearch(input)} input={input} />
    </main>
  );
}
