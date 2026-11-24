import type { Metadata } from "next";
import { cache } from "react";
import { HomeView } from "@/components/home/HomeView";
import { ResolvedUrl } from "@/components/home/ResolvedUrl";
import { NavDone } from "@/components/NavLink";
import { AREAS } from "@/lib/areas";
import { foodDisplayName } from "@/lib/food";
import type { PresetPoint } from "@/lib/geocode";
import type { HomeData, PlaceHit, SearchState } from "@/lib/home-data";
import { type HomeQuery, homeHref, parseHome, scopeInput, scopeName } from "@/lib/home-params";
import { SITE_NAME, shareImages, shareTwitterImages } from "@/lib/site";
import { type AreaDataset, loadAreaWithPlace, presetCenter, searchStores } from "@/lib/stores";
import { THEMES } from "@/lib/themes";
import { lookupName } from "@/lib/word-region";

// 매장 검색 2건(5초)과 맨 낱말의 지역 후보 2건(3초)을 함께, 0곳이면 장소 검색 1건(3초)을 더하고(약 8초),
// 그다음 장소 검색 2건(각 3초) + 상권 조회 3건(5초). 타임아웃 기준 최악 약 19초.
export const maxDuration = 30;

// 결과를 스트리밍하지 않고 첫 HTML에 넣는다(JS 없이도 목록이 보이고, 단톡방 미리보기가 메타를 읽게).
// 그래서 이 페이지는 이동할 때 서버 응답을 기다려도 된다고 표시한다(Cache Components 정적 셸 검증 제외).
export const instant = false;

/** 내 주변 대체 제공자가 쓰는 프리셋 상권 중심(서버에서 한 번 계산) */
const PRESETS: PresetPoint[] = AREAS.flatMap((a) => {
  const c = presetCenter(a);
  return c ? [{ slug: a.slug, name: a.name, lat: c.lat, lng: c.lng, gu: a.sigungu[0], dong: a.dongs[0] }] : [];
});

type Loaded = { status: "ok"; dataset: AreaDataset; place: PlaceHit | null } | { status: "error" };

// 음식 조건이 있으면 조회에 업종을 함께 보낸다(지역 전체를 받아 화면에서 거르지 않는다).
async function load(h: HomeQuery): Promise<Loaded> {
  try {
    const { dataset, place } = await loadAreaWithPlace({ ...scopeInput(h.scope), category: h.food ?? undefined });
    return { status: "ok", dataset, place };
  } catch {
    return { status: "error" };
  }
}

// 가게 이름 검색과 맨 낱말 지역 풀이(lookupName, 상권 분석의 맨 낱말 검색도 같이 쓴다).
// 메타데이터와 본문이 같은 요청에서 한 번만 부르게 묶는다.
const nameLookup = cache(lookupName);

/**
 * 주소의 해석을 확정한다. 가게 이름 검색(영수증 링크 아님)은 이름 검색을 하고, 범위가 없는 맨 낱말이 지역으로 풀리면
 * 그 지역을 범위로 한 홈을 그리고, 그 주소(loc + q)를 to에 준다. 화면이 주소를 to로 바꿔 새로고침, 공유, 머리말 링크가 같은 지역을 보게 한다.
 * (redirect는 이 페이지가 스트리밍이라 스크립트 없이는 빈 화면이 된다. 그래서 그 자리에서 그린다.)
 */
async function resolveHome(parsed: HomeQuery): Promise<{ h: HomeQuery; named: SearchState | null; to: string | null }> {
  if (!parsed.q || parsed.id) return { h: parsed, named: null, to: null };
  const { search: named, region } = await nameLookup(parsed.q, parsed.isDefault);
  if (!region) return { h: parsed, named, to: null };
  const h: HomeQuery = { ...parsed, scope: { kind: "loc", loc: region }, isDefault: false, near: false };
  const to = homeHref(h.scope, { q: h.q, excludeFranchise: h.excludeFranchise, theme: h.theme, sort: h.sort });
  return { h, named, to };
}

async function search(h: HomeQuery, dataset: AreaDataset | null): Promise<SearchState | null> {
  if (!h.q) return null;
  // 상권 분석에서 넘어온 링크(id가 지금 상권 안에 있음)는 매장 검색을 다시 부르지 않는다.
  const inArea = h.id ? dataset?.stores.find((s) => s.id === h.id) : undefined;
  if (inArea) return { status: "ok", query: h.q, stores: [inArea] };
  try {
    const r = await searchStores(h.q);
    return { status: r.stores.length ? "ok" : "empty", query: r.query, stores: r.stores };
  } catch {
    return { status: "error", query: h.q, stores: [] };
  }
}

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const { h } = await resolveHome(parseHome(await searchParams));
  const name = scopeName(h.scope);
  const theme = h.theme === "all" ? null : (THEMES.find((t) => t.id === h.theme)?.label ?? null);
  // 범위 없는 가게 이름 검색만 매장 검색 제목을 쓴다(지역으로 풀린 낱말은 지역 제목).
  const nameSearch = h.q && !h.id && h.isDefault ? h.q : null;
  const plain = h.isDefault && !nameSearch && !theme;
  const title = plain
    ? `${SITE_NAME} | BC카드 결제 데이터로 찾는 동네 맛집 지도`
    : nameSearch
      ? `${nameSearch} 매장 검색 | ${SITE_NAME}`
      : `${name}${h.food ? ` ${foodDisplayName(h.food)}` : ""} 맛집${theme ? `, ${theme}` : ""} | ${SITE_NAME}`;
  const description = plain
    ? "BC카드 실제 결제 데이터로 내 주변 매출 상위 가게, 동네맛집, 회식 장소를 지도에서 찾고, 가고 싶은 곳을 저장해 관리하세요."
    : nameSearch
      ? `${nameSearch} 이름으로 찾은 가게를 지점별 주소와 BC카드 결제 데이터로 확인합니다.`
      : `${name}${h.food ? ` ${foodDisplayName(h.food)}` : ""} 가게를 BC카드 결제 데이터로 확인하세요.${theme ? ` ${theme} 조건이 적용된 매장을 지도에서 보고 저장할 수 있습니다.` : " 매출 상위 1%, 동네맛집, 회식 적합 조건으로 찾아보고 저장할 수 있습니다."}`;
  // 공유 주소와 OG에는 범위, 검색어, 테마만 넣는다(near, 좌표, 개인 기록 없음).
  // 가게 이름 검색은 범위 없이 낸다(기본 상권을 붙이지 않는다). 지역으로 풀린 낱말은 loc + q.
  const canonical = plain
    ? "/"
    : nameSearch
      ? `/?${new URLSearchParams({ q: nameSearch }).toString()}`
      : homeHref(h.scope, { q: h.q && !h.id ? h.q : h.foodTerm, theme: h.theme });
  const foodName = h.food ? foodDisplayName(h.food) : null;
  const shareTitle = nameSearch ? title : `BC카드 결제 데이터로 비교한 ${name}${foodName ? ` ${foodName}` : ""} 맛집 | ${SITE_NAME}`;
  const shareDescription = nameSearch
    ? description
    : foodName
      ? `BC카드 결제 데이터로 ${name} ${foodName} 매장의 매출 상위 1%, 동네맛집, 회식 적합 표시를 확인하세요.`
      : `BC카드 결제 데이터로 ${name}의 매출 상위 1%, 동네맛집, 회식 적합 매장을 확인하세요.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, url: canonical, title: shareTitle, description: shareDescription, images: shareImages(title) },
    twitter: { card: "summary_large_image", title: shareTitle, description: shareDescription, images: shareTwitterImages(title) },
  };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  // 한 요청의 조회 상한: 가게 이름 검색 2건 + 상권 3건, 카카오 2건(역, 장소 범위는 키워드 1건 + 주변 동 1건).
  // 맨 낱말이 지역으로 풀리면 그 지역을 조회하고 주소를 loc + q로 바꾼다.
  const { h, named, to } = await resolveHome(parseHome(sp));
  // 범위 없는 가게 이름 검색은 상권을 조회하지 않는다(기본 상권 피드를 붙이지 않는다). 화면은 이름 검색 결과와 그 지도만 그린다.
  const loaded: Loaded | null = h.isDefault && h.q ? null : await load(h);
  const dataset = loaded?.status === "ok" ? loaded.dataset : null;
  const searched = named ?? (await search(h, dataset));
  // 지역 홈의 이름 검색(loc + q)은 보조라서 0곳이거나 실패하면 싣지 않는다(지역 홈만 보인다).
  const found = !h.isDefault && searched && searched.status !== "ok" ? null : searched;
  const data: HomeData = { query: h, dataset, search: found, presets: PRESETS, place: loaded?.status === "ok" ? loaded.place : null };
  return (
    <main id="main" className="home">
      <NavDone navKey={JSON.stringify(sp)} />
      {to ? <ResolvedUrl to={to} /> : null}
      <HomeView key={`${JSON.stringify(scopeInput(h.scope))}|${h.q ?? ""}|${h.food ?? ""}|${h.near ? 1 : 0}`} data={data} />
    </main>
  );
}
