import type { Metadata } from "next";
import { cache } from "react";
import { HomeView } from "@/components/home/HomeView";
import { NavDone } from "@/components/NavLink";
import { AREAS } from "@/lib/areas";
import type { PresetPoint } from "@/lib/geocode";
import type { HomeData, PlaceHit, SearchState } from "@/lib/home-data";
import { type HomeQuery, homeHref, parseHome, scopeEntries, scopeInput, scopeName } from "@/lib/home-params";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { regionForWord } from "@/lib/place";
import { type AreaDataset, loadAreaWithPlace, presetCenter, searchStores } from "@/lib/stores";
import { THEMES } from "@/lib/themes";

// 매장 검색 2건(5초) + 장소 검색 2건(각 3초) + 상권 조회 3건(5초), 타임아웃 기준 최악 약 16초.
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

/**
 * 가게 이름 검색. 0곳이고 맨 지명(낙산공원)이면 region에 지역 조회용 loc를 준다.
 * 메타데이터와 본문이 같은 요청에서 한 번만 부르게 묶는다.
 */
const nameLookup = cache(async (q: string): Promise<{ search: SearchState; region: string | null }> => {
  let found: SearchState;
  try {
    const r = await searchStores(q);
    found = { status: r.stores.length ? "ok" : "empty", query: r.query, stores: r.stores };
  } catch {
    found = { status: "error", query: q, stores: [] };
  }
  return { search: found, region: found.status === "empty" ? await regionForWord(q) : null };
});

/**
 * 주소의 해석을 확정한다. 가게 이름 검색(영수증 링크 아님)은 검색을 먼저 하고,
 * 0곳이며 맨 지명이면 그 지역 조회로 바꾼다(q를 비우고 범위를 loc로). 그때 상권은 기본 상권 대신 그 지역만 조회한다.
 */
async function resolveHome(parsed: HomeQuery): Promise<{ h: HomeQuery; named: SearchState | null }> {
  if (!parsed.q || parsed.id) return { h: parsed, named: null };
  const { search: named, region } = await nameLookup(parsed.q);
  if (!region) return { h: parsed, named };
  return { h: { ...parsed, scope: { kind: "loc", loc: region }, isDefault: false, q: null }, named: null };
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
  const nameSearch = h.q && !h.id ? h.q : null;
  const plain = h.isDefault && !nameSearch && !theme;
  const title = plain
    ? SITE_NAME
    : nameSearch
      ? `${nameSearch} 매장 검색 | ${SITE_NAME}`
      : `${name}${h.food ? `, ${h.food} 업종` : ""}${theme ? `, ${theme}` : ""} 후보 | ${SITE_NAME}`;
  const description = plain
    ? SITE_DESCRIPTION
    : nameSearch
      ? `${nameSearch} 이름으로 찾은 가게를 지점별 주소와 BC카드 결제 데이터로 확인합니다.`
      : `${name}에서 조회한 가게를 BC카드 결제 데이터로 고릅니다. 매출 상위 1%, 동네맛집 표시, 회식 적합 표시로 후보를 훑고 저장합니다.`;
  // 공유 주소와 OG에는 범위, 검색어, 테마만 넣는다(near, 좌표, 개인 기록 없음).
  const canonical = plain ? "/" : homeHref(h.scope, { q: nameSearch ?? h.foodTerm, theme: h.theme });
  const image = `/og?${new URLSearchParams(scopeEntries(h.scope)).toString()}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, url: canonical, title, description, images: [{ url: image, width: 1200, height: 630, alt: `${name} 결제 데이터 후보` }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  // 한 요청의 조회 상한: 가게 이름 검색 2건 + 상권 3건, 카카오 2건(맨 지명은 키워드 1건 + 주변 동 1건).
  const { h, named } = await resolveHome(parseHome(sp));
  const loaded = await load(h);
  const dataset = loaded.status === "ok" ? loaded.dataset : null;
  const found = named ?? (await search(h, dataset));
  const data: HomeData = { query: h, dataset, search: found, presets: PRESETS, place: loaded.status === "ok" ? loaded.place : null };
  return (
    <main id="main" className="home">
      <NavDone navKey={JSON.stringify(sp)} />
      <HomeView key={`${JSON.stringify(scopeInput(h.scope))}|${h.q ?? ""}|${h.food ?? ""}|${h.near ? 1 : 0}`} data={data} />
    </main>
  );
}
