import type { Metadata } from "next";
import { HomeView, type HomeData, type SearchState } from "@/components/home/HomeView";
import { NavDone } from "@/components/NavLink";
import { AREAS } from "@/lib/areas";
import type { PresetPoint } from "@/lib/geocode";
import { type HomeQuery, homeHref, parseHome, scopeEntries, scopeInput, scopeName } from "@/lib/home-params";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { type AreaDataset, loadArea, presetCenter, searchStores } from "@/lib/stores";

// 상권 조회 3건 + 매장 검색 2건, 타임아웃 5초 기준 최악 약 10초.
export const maxDuration = 30;

// 결과를 스트리밍하지 않고 첫 HTML에 넣는다(JS 없이도 목록이 보이고, 단톡방 미리보기가 메타를 읽게).
// 그래서 이 페이지는 이동할 때 서버 응답을 기다려도 된다고 표시한다(Cache Components 정적 셸 검증 제외).
export const instant = false;

/** 내 주변 대체 제공자가 쓰는 프리셋 상권 중심(서버에서 한 번 계산) */
const PRESETS: PresetPoint[] = AREAS.flatMap((a) => {
  const c = presetCenter(a);
  return c ? [{ slug: a.slug, name: a.name, lat: c.lat, lng: c.lng, gu: a.sigungu[0], dong: a.dongs[0] }] : [];
});

type Loaded = { status: "ok"; dataset: AreaDataset } | { status: "error" };

async function load(h: HomeQuery): Promise<Loaded> {
  try {
    return { status: "ok", dataset: await loadArea({ ...scopeInput(h.scope), category: h.food ?? undefined }) };
  } catch {
    return { status: "error" };
  }
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
  const h = parseHome(await searchParams);
  const name = scopeName(h.scope);
  const title = h.isDefault ? SITE_NAME : `${name}${h.food ? `, ${h.food} 업종` : ""} 근처 후보 | ${SITE_NAME}`;
  const description = h.isDefault ? SITE_DESCRIPTION : `${name}에서 조회한 가게를 BC카드 결제 데이터로 고릅니다. 가까운 순으로 보고, 동네맛집 표시와 회식 적합 표시 같은 근거를 차트로 확인합니다.`;
  // 공유 주소와 OG에는 상권만 넣는다(near, 좌표, 개인 기록 없음).
  const canonical = h.isDefault ? "/" : homeHref(h.scope);
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
  const h = parseHome(sp);
  const loaded = await load(h);
  const dataset = loaded.status === "ok" ? loaded.dataset : null;
  const found = await search(h, dataset);
  const data: HomeData = { query: h, dataset, search: found, presets: PRESETS };
  return (
    <main id="main" className="home">
      <NavDone navKey={JSON.stringify(sp)} />
      <HomeView key={`${JSON.stringify(scopeInput(h.scope))}|${h.q ?? ""}|${h.food ?? ""}|${h.near ? 1 : 0}`} data={data} />
    </main>
  );
}
