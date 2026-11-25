"use client";

import "@/app/feed.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useMyAreas } from "@/components/area/my-areas-store";
import { EvidenceChart } from "@/components/evidence";
import { MerLink } from "@/components/MerLink";
import { NavLink, setNavPending } from "@/components/NavLink";
import { Sheet } from "@/components/Sheet";
import { AREAS, areaBySlug } from "@/lib/areas";
import { briefingOf } from "@/lib/briefing";
import { AREA_SEARCH_MAX_KM, areaSearchPick, insideStores, loadPanStores, type MapView, PAN_WAIT_MS, type PanStore } from "@/lib/area-search";
import { assignSections, SECTION_ORDER, type SectionId } from "@/lib/curation-assign";
import { evidenceLabel } from "@/lib/evidence";
import { foodDisplayName } from "@/lib/food";
import { currentPosition, geolocationGranted, getGeo, type LocateError, setGeo, useGeo } from "@/lib/geo-state";
import { geocoderChain, reverseGeocode } from "@/lib/geocode";
import type { HomeData, SearchState } from "@/lib/home-data";
import { type HomeScope, type HomeSort, analysisHref, homeHref, scopeName } from "@/lib/home-params";
import { recommend } from "@/lib/recommend";
import { displayName, distanceLabel, distanceM, dongLocOf } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import { CURATIONS, isThemeId, matchTheme, type ThemeId, THEMES, Y2030_SUB } from "@/lib/themes";
import { setHomeContext } from "@/lib/ui-state";
import { withUtm } from "@/lib/utm";
import { useVisits, type VisitRecord } from "@/lib/visits";
import { Briefing } from "./Briefing";
import { RegionChips, ThemeChips } from "./Chips";
import { CURATION_MAX, Curation } from "./Curation";
import { MapSection, type MapSectionHandle } from "./MapSection";
import { Receipt } from "./Receipt";
import { homeRegions, RegionPanel } from "./RegionAdd";
import { TasteSummary, useHydrated } from "./TasteSummary";

/** 추천 섹션 제목과 부제(전체 테마에서 매출 상위 1% 다음) */
const RECO_TITLE = "내 저장 패턴과 비슷한 곳";
const RECO_SUB = "내가 저장한 곳과 업종이 같은 매장";

/** 이름만 검색에서 지역 칩 활성 표시를 끄는 범위(어느 칩과도 같지 않다) */
const NO_SCOPE: HomeScope = { kind: "loc", loc: "" };

/** 상호 검색 결과를 한 번에 보여 주는 수 */
const SEARCH_PAGE = 8;
/** 마지막으로 본 지역(이름만, 좌표 없음). 사용자가 직접 고른 지역만 남긴다 */
const LAST_REGION_KEY = "eatsy:last-region";

// 위치를 못 받았을 때 안내. 까닭과 다음 행동만 적는다. 어느 경우든 보던 지역은 그대로 둔다.
const LOCATE_FAIL: Record<LocateError | "geocode", string> = {
  blocked: "이 사이트의 위치 사용이 꺼져 있습니다. 주소창의 사이트 설정에서 위치를 허용한 뒤 내 위치를 다시 눌러 주세요.",
  off: "위치를 받지 못했습니다. 기기의 위치 서비스가 켜져 있는지 확인한 뒤 내 위치를 다시 눌러 주세요.",
  timeout: "위치를 찾는 데 시간이 오래 걸려 멈췄습니다. 잠시 뒤 내 위치를 다시 눌러 주세요.",
  unsupported: "이 브라우저에서는 위치를 쓸 수 없습니다. 지역을 직접 입력해 주세요.",
  unavailable: "지금은 위치를 확인하지 못했습니다. 잠시 뒤 내 위치를 다시 눌러 주세요.",
  geocode: "지금 위치 근처는 아직 준비된 상권이 없습니다. 지역을 직접 입력해 주세요.",
};

type Point = { lat: number; lng: number };
type Origin = { point: Point; label: string } | null;

function centroid(stores: Store[]): Point | null {
  const pts = stores.filter((s) => s.lat !== null && s.lng !== null);
  if (pts.length === 0) return null;
  return { lat: pts.reduce((a, s) => a + (s.lat as number), 0) / pts.length, lng: pts.reduce((a, s) => a + (s.lng as number), 0) / pts.length };
}

/** 지금 주소에 사용자가 고른 조건(상권, 동네, 검색어, 영수증)이 있는가. t, fr, s, d는 지역 조건으로 보지 않는다 */
function urlHasChoice(): boolean {
  const p = new URLSearchParams(window.location.search);
  return ["area", "loc", "q", "id"].some((k) => p.has(k));
}

/** 주소의 일부 값만 바꾼다(나머지는 그대로). push면 뒤로 가기로 돌아올 수 있다. 서버를 다시 부르지 않는다 */
function patchUrl(patch: Record<string, string | null>, push = false) {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  const url = qs ? `/?${qs}` : "/";
  if (url === `${window.location.pathname}${window.location.search}`) return;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function readLastRegion(): HomeScope | null {
  try {
    const raw = window.localStorage.getItem(LAST_REGION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { area?: unknown; loc?: unknown };
    if (typeof v.area === "string") {
      const a = areaBySlug(v.area);
      return a ? { kind: "area", slug: a.slug, name: a.name } : null;
    }
    if (typeof v.loc === "string" && v.loc.length > 0 && v.loc.length <= 30) return { kind: "loc", loc: v.loc };
    return null;
  } catch {
    return null;
  }
}

function writeLastRegion(scope: HomeScope) {
  try {
    window.localStorage.setItem(LAST_REGION_KEY, JSON.stringify(scope.kind === "area" ? { area: scope.slug } : { loc: scope.loc }));
  } catch {
    // 저장소를 못 쓰면 예시 지역으로 시작한다
  }
}

export function HomeView({ data }: { data: HomeData }) {
  const { query: h, dataset, search, presets, place } = data;
  /** 범위 없는 가게 이름 검색: 지역 피드 없이 이름 검색 결과와 그 지도만 보인다(서버가 상권을 조회하지 않는다) */
  const nameOnly = h.isDefault && !!h.q;
  /**
   * 지역 홈 + 그 낱말이 이름에 들어간 가게(맨 낱말이 지역으로 풀림, 상권 분석의 영수증 링크도 같은 꼴). 이름 검색은 지도 아래 보조 섹션이다.
   * 영수증을 열어 주소에 id가 붙어도 같은 배치를 유지한다(새로고침해도 같은 화면).
   * 범위 안 이름 검색(search.scopeTitle, 머리말에서 메뉴나 가게 이름을 지금 지역과 함께 검색)은 보조가 아니라 피드 위 검색 자리에 그린다.
   */
  const regionNamed = !h.isDefault && !!h.q && !search?.scopeTitle;
  const router = useRouter();
  const sp = useSearchParams();
  const geo = useGeo();
  const [isPending, startTransition] = useTransition();

  // 테마, 프랜차이즈 제외, 정렬은 주소가 정본이다(공유와 뒤로 가기). 바꿀 때는 주소만 고치고 서버를 부르지 않는다.
  const tRaw = sp.get("t");
  const theme: ThemeId = isThemeId(tRaw) ? tRaw : "all";
  const exclude = sp.get("fr") !== "0";
  const sort: HomeSort = sp.get("s") === "rank" ? "rank" : "near";

  const [message, setMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [extra, setExtra] = useState<Map<string, Store>>(() => new Map());
  const [peakOpen, setPeakOpen] = useState(false);
  const initialSelected = useMemo(() => {
    if (h.id) return h.id;
    // 상호 검색이 한 곳으로 좁혀지면(프랜차이즈 제외를 적용한 뒤) 영수증을 바로 연다.
    const shownSearch = search?.status === "ok" ? search.stores.filter((st) => !(h.excludeFranchise && st.franchise)) : [];
    // 지역 홈의 보조 섹션이면 열지 않는다(지역 홈을 보러 왔다).
    if (shownSearch.length === 1 && !regionNamed) return shownSearch[0].id;
    return null;
  }, [h.id, h.excludeFranchise, search, regionNamed]);
  /** 영수증을 연 매장 */
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const lastTrigger = useRef<HTMLElement | null>(null);
  /** 사용자가 직접 조건을 골랐다. 늦게 끝난 자동 내 주변 확인이 이를 덮지 않게 한다 */
  const userPicked = useRef(false);

  // 이동 대기 표시는 트랜지션이 진행 중일 때만 켠다.
  useEffect(() => {
    if (!isPending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [isPending]);

  const go = useCallback((href: string, replace = false) => startTransition(() => (replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false }))), [router]);

  const scope: HomeScope = h.scope;
  const nearShown = h.near && geo.me !== null;

  // ----- 내 주변 -----
  const locate = useCallback(
    async (mode: "auto" | "click") => {
      if (getGeo().locating) return;
      setGeo({ locating: true });
      if (mode === "click") {
        setMessage(null);
        setDenied(false);
        userPicked.current = true;
      }
      let pos: Point;
      try {
        pos = await currentPosition();
      } catch (e) {
        setGeo({ locating: false });
        const err = (e as LocateError) in LOCATE_FAIL ? (e as LocateError) : "unavailable";
        // 자동 확인이 실패하면 조용히 지나간다(사용자가 누르지 않았다). 버튼의 사선도 누른 뒤에만 켠다.
        if (mode === "click") {
          if (err === "blocked" || err === "off") setDenied(true);
          setMessage(LOCATE_FAIL[err]);
        }
        return;
      }
      const found = await reverseGeocode(pos.lat, pos.lng, geocoderChain(presets));
      // 자동 확인 중에 사용자가 지역을 직접 골랐으면 덮어쓰지 않는다.
      if (mode === "auto" && (userPicked.current || urlHasChoice())) {
        setGeo({ locating: false });
        return;
      }
      if (!found || (!found.presetSlug && !found.dong && !found.gu)) {
        setGeo({ locating: false });
        if (mode === "click") setMessage(LOCATE_FAIL.geocode);
        return;
      }
      setGeo({ locating: false, me: pos, gu: found.gu, retriedGu: false });
      const next: HomeScope = found.presetSlug
        ? { kind: "area", slug: found.presetSlug, name: AREAS.find((a) => a.slug === found.presetSlug)?.name ?? "" }
        : { kind: "loc", loc: (found.dong ?? found.gu) as string };
      const keep = { excludeFranchise: exclude, theme, sort };
      const href = homeHref(next, { near: true, ...keep });
      // 이미 같은 동네를 내 주변으로 보고 있으면 위치만 갱신하고 서버를 다시 부르지 않는다.
      if (h.near && !h.q && !h.food && href === homeHref(h.scope, { near: true, ...keep })) return;
      // 자동 확인은 사용자 동작 없이 도착 주소를 바꾸므로 홍보 링크의 UTM을 남긴다(lib/utm). 누른 이동에는 붙이지 않는다.
      go(mode === "auto" ? withUtm(href, window.location.search) : href);
    },
    [presets, go, exclude, theme, sort, h.near, h.q, h.food, h.scope],
  );

  // 조건 없는 첫 진입: 위치 권한이 이미 있으면 내 주변으로 시작한다. 없으면 마지막으로 직접 고른 지역, 그것도 없으면 예시 지역 그대로.
  useEffect(() => {
    if (!h.isDefault || h.q || h.id || getGeo().autoChecked) return;
    setGeo({ autoChecked: true });
    let alive = true;
    geolocationGranted().then((ok) => {
      if (!alive || userPicked.current || urlHasChoice()) return;
      if (ok) {
        void locate("auto");
        return;
      }
      const last = readLastRegion();
      if (last && homeHref(last) !== homeHref(h.scope)) {
        const p = new URLSearchParams(window.location.search);
        // 도착 주소를 바꾸는 자동 이동이라 홍보 링크의 UTM을 남긴다(lib/utm).
        const href = homeHref(last, { excludeFranchise: p.get("fr") !== "0", theme: isThemeId(p.get("t")) ? (p.get("t") as ThemeId) : "all", sort: p.get("s") === "rank" ? "rank" : "near" });
        go(withUtm(href, window.location.search), true);
      }
    });
    return () => {
      alive = false;
    };
  }, [h.isDefault, h.q, h.id, h.scope, locate, go]);

  // 사용자가 직접 고른 지역(예시, 내 주변, 매장 이름 검색이 아닌 것)만 기기에 남긴다. 이름만 쓴다.
  useEffect(() => {
    if (h.isDefault || h.near || !dataset || dataset.stores.length === 0) return;
    writeLastRegion(h.scope);
  }, [h.isDefault, h.near, h.scope, dataset]);

  // 동 조회가 0건이면 시군구로 한 번 다시 조회한다.
  useEffect(() => {
    if (!h.near || !dataset || dataset.stores.length > 0) return;
    const g = getGeo();
    if (!g.gu || g.retriedGu || (scope.kind === "loc" && scope.loc === g.gu)) return;
    setGeo({ retriedGu: true });
    // 자동 다시 조회라 지금 주소의 UTM을 남긴다(lib/utm). UTM이 없으면 주소는 그대로다.
    go(withUtm(homeHref({ kind: "loc", loc: g.gu }, { near: true, excludeFranchise: exclude, theme, sort }), window.location.search), true);
  }, [h.near, dataset, scope, go, exclude, theme, sort]);

  // ----- 후보 집합 하나: 지역 조회 결과 → 프랜차이즈 제외. 브리핑, 큐레이션, 지도와 목록이 모두 여기서 나온다 -----
  const all = useMemo(() => dataset?.stores ?? [], [dataset]);
  /** 이름만 검색의 지도 후보: 프랜차이즈 제외를 적용한 검색 결과 중 좌표가 있는 곳 */
  const nameMapped = useMemo(
    () => (nameOnly && search?.status === "ok" ? search.stores.filter((s) => !(exclude && s.franchise) && s.lat !== null && s.lng !== null) : []),
    [nameOnly, search, exclude],
  );
  const pool = useMemo(() => (exclude ? all.filter((s) => !s.franchise) : all), [all, exclude]);
  const themed = useMemo(() => (theme === "all" ? pool : pool.filter((s) => matchTheme(s, theme))), [pool, theme]);
  const brief = useMemo(() => briefingOf(pool), [pool]);

  // 거리 기준점: 내 주변이면 내 위치, 역이나 장소 검색이면 그 장소, 프리셋이면 상권 중심, 그 밖은 조회 결과 중심.
  const origin: Origin = useMemo(() => {
    if (nearShown && geo.me) return { point: geo.me, label: "내 위치" };
    if (dataset?.center) return { point: dataset.center, label: place ? place.name : `${dataset.title} 중심` };
    // 이름만 검색은 지역이 없어 결과 중심 거리가 뜻이 없다(전국 지점). 이미 받은 내 위치가 있을 때만 그 거리를 쓴다.
    if (nameOnly) return geo.me ? { point: geo.me, label: "내 위치" } : null;
    const c = centroid(all);
    return c ? { point: c, label: "조회 결과 중심" } : null;
  }, [nearShown, geo.me, dataset, place, all, nameOnly]);
  const focus: Point | null = nearShown && geo.me ? geo.me : (dataset?.center ?? null);
  const distanceOf = useCallback((s: Store) => (origin ? distanceM(origin.point, s) : null), [origin]);

  const byId = useMemo(() => {
    const m = new Map<string, Store>();
    for (const s of all) m.set(s.id, s);
    for (const s of search?.stores ?? []) if (!m.has(s.id)) m.set(s.id, s);
    for (const [id, s] of extra) if (!m.has(id)) m.set(id, s);
    return m;
  }, [all, search, extra]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  // 지역 조회나 검색 결과에서 온 매장만 지금 조회값이다. extra에만 있는 매장은 내 저장이 넘긴 사본일 수 있다.
  const selectedLive = !!selected && (all.some((s) => s.id === selected.id) || !!search?.stores?.some((s) => s.id === selected.id));

  /** 결제 영수증을 연다(카드, 목록, 핀, 검색 결과, 내 저장 어디서 열든 같은 것 하나) */
  const openStore = useCallback((store: Store, trigger?: HTMLElement | null) => {
    lastTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setExtra((m) => (m.has(store.id) ? m : new Map(m).set(store.id, store)));
    setPeakOpen(false);
    setSelectedId(store.id);
    patchUrl({ id: store.id });
  }, []);
  const close = useCallback(() => {
    setSelectedId(null);
    setPeakOpen(false);
    patchUrl({ id: null });
    const t = lastTrigger.current;
    if (t && document.contains(t)) t.focus();
  }, []);

  // 이름만 검색은 지역이 없다(기본 상권 이름을 쓰지 않는다).
  const where = nameOnly ? `${h.q} 검색` : dataset ? (nearShown ? `내 주변, ${dataset.title}` : dataset.title) : scopeName(scope);
  const region = dataset && h.food ? `${where} ${foodDisplayName(h.food)} 업종` : where;
  /** 큐레이션 제목의 지역 이름(음식 조건과 내 주변 표시는 빼고 조회 지역만) */
  const areaTitle = dataset?.title ?? scopeName(scope);

  // 헤더의 내 저장 시트가 지금 후보와 영수증 열기를 쓴다.
  const openFromSaves = useCallback((store: Store) => openStore(store, null), [openStore]);
  useEffect(() => {
    setHomeContext({ stores: pool, title: region, open: openFromSaves });
    return () => setHomeContext(null);
  }, [pool, region, openFromSaves]);

  const pickTheme = (t: ThemeId) => {
    if (t === theme) return;
    patchUrl({ t: t === "all" ? null : t }, true);
  };
  const toggleExclude = () => {
    const v = !exclude;
    // 상호 검색이 토글 뒤 한 곳으로 좁혀지면 그 영수증을 연다.
    const left = search?.status === "ok" ? search.stores.filter((st) => !(v && st.franchise)) : [];
    if (left.length === 1 && !selectedId) {
      lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelectedId(left[0].id);
      patchUrl({ fr: v ? null : "0", id: left[0].id }, true);
      return;
    }
    patchUrl({ fr: v ? null : "0" }, true);
  };
  const pickSort = useCallback((s: HomeSort) => patchUrl({ s: s === "rank" ? "rank" : null }), []);

  const regionHref = (to: HomeScope) => homeHref(to, { q: h.food ? h.foodTerm : null, excludeFranchise: exclude, theme, sort });

  // 지역 칩 목록(상권 랭킹 내 상권 목록과 같은 저장소)과 지역 추가, 편집 패널
  const myAreas = useMyAreas();
  const regions = useMemo(() => homeRegions(myAreas, scope), [myAreas, scope]);
  const [regionPanel, setRegionPanel] = useState<"add" | "edit" | null>(null);
  const regionPanelId = useId();
  const closeRegionPanel = () => {
    setRegionPanel(null);
    document.querySelector<HTMLElement>('[data-testid="region-add"]')?.focus({ preventScroll: true });
  };
  const goRegion = (to: HomeScope) => {
    userPicked.current = true;
    setRegionPanel(null);
    go(regionHref(to));
  };
  // 홈 지도의 현 지도에서 검색: 지도 중심을 역지오코딩(내 위치와 같은 순서 목록)하고, 보이는 가로 폭으로 동, 구, 시를 골라
  // 지역 칩과 같은 방식으로 이동한다(기록이 남는 이동, 테마, 프랜차이즈 제외, 정렬, 음식 조건 유지). 못 가면 지도 위 안내 문구를 돌려준다.
  const searchArea = async (v: MapView): Promise<string | null> => {
    // reverseGeocode는 제공자 실패를 다음 제공자로 넘기고, 모두 실패하면 null이다(areaSearchPick이 실패 안내로 바꾼다).
    const found = await reverseGeocode(v.lat, v.lng, geocoderChain(presets));
    const pick = areaSearchPick(found, v.widthKm);
    if ("note" in pick) return pick.note;
    if (!h.near && homeHref(pick.scope) === homeHref(scope)) return "지금 보고 있는 지역입니다.";
    goRegion(pick.scope);
    return null;
  };

  // 옮긴 동네 핀(lib/area-search.ts 머리 주석): 제스처 이동이 끝나고 PAN_WAIT_MS 멈추면, 폭과 지금 매장 범위를 먼저 보고
  // 역지오코딩과 범위 고르기를 거쳐 다른 범위일 때만 받는다. 마지막 이동의 결과만 쓴다. 자동 맞춤으로 돌아가면 지운다.
  const [panned, setPanned] = useState<{ scope: HomeScope; stores: PanStore[] } | null>(null);
  const panTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panSeq = useRef(0);
  useEffect(
    () => () => {
      if (panTimer.current !== null) clearTimeout(panTimer.current);
      panSeq.current += 1;
    },
    [],
  );
  const onPanView = useCallback(
    (v: MapView | null) => {
      if (panTimer.current !== null) clearTimeout(panTimer.current);
      panTimer.current = null;
      const seq = ++panSeq.current;
      if (v === null) {
        setPanned(null);
        return;
      }
      if (v.widthKm > AREA_SEARCH_MAX_KM || insideStores(all, v)) return;
      panTimer.current = setTimeout(() => {
        panTimer.current = null;
        void (async () => {
          const pick = areaSearchPick(await reverseGeocode(v.lat, v.lng, geocoderChain(presets)), v.widthKm);
          if (seq !== panSeq.current || "note" in pick || homeHref(pick.scope) === homeHref(scope)) return;
          const list = await loadPanStores(pick.scope);
          if (seq === panSeq.current && list) setPanned({ scope: pick.scope, stores: list });
        })();
      }, PAN_WAIT_MS);
    },
    [all, presets, scope],
  );
  // 지금 범위에 이미 있는 매장은 빼고, 프랜차이즈 제외와 테마는 지금 핀과 같게 건다.
  const panShown = useMemo(() => {
    if (!panned) return [];
    const have = new Set(all.map((s) => s.id));
    return panned.stores.filter((s) => !have.has(s.id) && !(exclude && s.franchise) && (theme === "all" || matchTheme(s, theme)));
  }, [panned, all, exclude, theme]);
  // 옮긴 동네 핀을 누르면 그 매장 주소의 동(구 + 동)으로 홈 범위를 바꾸고 영수증을 연 채로 그린다(주소 id, 기록 남는 이동).
  // 동을 못 읽는 주소(읍, 면)는 그 핀을 받아 온 범위로 간다. 음식 조건은 넘기지 않는다(id가 있으면 q를 가게 이름으로 읽는다).
  const openPanned = useCallback(
    (id: string) => {
      const s = panned?.stores.find((x) => x.id === id);
      if (!panned || !s) return;
      const dong = dongLocOf(s.address);
      userPicked.current = true;
      go(homeHref(dong ? { kind: "loc", loc: dong } : panned.scope, { id: s.id, excludeFranchise: exclude, theme, sort }));
    },
    [panned, go, exclude, theme, sort],
  );

  const onNear = () => {
    // 이미 내 주변이면 다시 묻지 않는다.
    if (nearShown) return;
    void locate("click");
  };
  const onLocate = useCallback(() => {
    // 이미 내 주변이면 지도가 스스로 내 위치로 맞춘다.
    if (nearShown) return;
    void locate("click");
  }, [nearShown, locate]);
  const locateState: "idle" | "locating" | "on" | "denied" = geo.locating ? "locating" : nearShown ? "on" : denied ? "denied" : "idle";

  const focusSearch = () => document.getElementById("site-q")?.focus();
  const focusRegions = () => {
    const first = document.querySelector<HTMLElement>("#region-chips [data-testid='region-chip']");
    first?.scrollIntoView({ block: "nearest" });
    first?.focus();
  };

  // 지역 줄의 지도 보기: 지도 섹션이 그려질 때만 버튼을 둔다(조회 실패, 0건, 빈 테마에는 없다). 큐레이션 순서는 그대로다.
  const mapRef = useRef<MapSectionHandle>(null);
  const mapShown = nameOnly ? nameMapped.length > 0 : !!dataset && pool.length > 0 && themed.length > 0;
  const onMap = useCallback(() => mapRef.current?.reveal(), []);

  // 지도와 목록에 보이는 수가 분석 대상 수와 다를 때만 숫자로 적는다(지도는 위치 정보가 있는 곳만 그린다). 예: 회식 적합 12곳, 지도 11곳
  const mapped = themed.filter((s) => s.lat !== null && s.lng !== null).length;
  const themeLabel = THEMES.find((t) => t.id === theme)?.label ?? "";
  const mapNote =
    theme !== "all"
      ? `${themeLabel} ${themed.length}곳${mapped < themed.length ? `, 지도 ${mapped}곳` : ""}`
      : mapped < pool.length
        ? `지도 ${mapped}곳`
        : null;

  // ----- 내 저장 패턴과 비슷한 곳 -----
  // 기기 저장 데이터라 붙은 뒤에만 계산한다(서버 렌더에는 추천 섹션이 없다).
  // 화면 방문 동안 고정: 지금 후보(지역, 음식, 프랜차이즈)와 테마가 바뀔 때만 그 순간의 저장 기록으로 다시 계산한다.
  // 그래서 카드의 북마크를 눌러도 추천과 섹션 배정이 바뀌지 않고, 누른 카드는 그 자리에 남아 포커스를 잃지 않는다.
  // 요약(TasteSummary)의 수와 저장 패턴은 바로 바뀐다.
  const hydrated = useHydrated();
  const { records } = useVisits();
  const [frozen, setFrozen] = useState<{ pool: Store[]; theme: ThemeId; records: VisitRecord[] } | null>(null);
  if (hydrated && (frozen === null || frozen.pool !== pool || frozen.theme !== theme)) {
    setFrozen({ pool, theme, records: Object.values(records) });
  }
  const recoRecords = frozen && frozen.pool === pool && frozen.theme === theme ? frozen.records : null;

  // 전체 테마: 섹션 순서대로 카드를 배정하고, 앞 섹션에 실은 매장은 뒤 섹션에서 뺀다(화면 폭과 무관).
  // 추천은 매출 상위 1%에 실제 배정된 매장을 후보에서 뺀 뒤 부른다. 그래야 추천 칸이 겹침으로 줄지 않고 다음 후보로 찬다.
  // 테마를 고르면 그 조건의 매장을 중복 제거 없이 싣고, 추천도 그 조건의 후보에서 고른다. 지도와 전체 매장은 언제나 조건에 맞는 전부다.
  const { sections, reasons } = useMemo(() => {
    type Sec = { theme: ThemeId | SectionId; title: string; sub: string; list: Store[]; total: number; shownElsewhere: number };
    const qualified = new Map(CURATIONS.map((c) => [c.theme, pool.filter((st) => matchTheme(st, c.theme))]));
    const top1Ids = new Set(theme === "all" ? assignSections({ top1: qualified.get("top1") }, CURATION_MAX).top1.map((st) => st.id) : []);
    const rec = recoRecords ? recommend((theme === "all" ? pool : themed).filter((st) => !top1Ids.has(st.id)), recoRecords) : null;
    const recoStores = rec?.items.map((it) => it.store) ?? [];
    const reasonMap = new Map(rec?.items.map((it) => [it.store.id, it.reason]) ?? []);
    const recoSec = (list: Store[]): Sec => ({ theme: "reco", title: RECO_TITLE, sub: rec?.note ? `${RECO_SUB}. ${rec.note}` : RECO_SUB, list, total: list.length, shownElsewhere: 0 });

    if (theme !== "all") {
      const c = CURATIONS.find((x) => x.theme === theme);
      const out: Sec[] = [{ theme, title: c?.title(areaTitle) ?? themeLabel, sub: c?.sub ?? Y2030_SUB, list: themed.slice(0, CURATION_MAX), total: themed.length, shownElsewhere: 0 }, recoSec(recoStores)];
      return { sections: out.filter((x) => x.list.length > 0), reasons: reasonMap };
    }
    const assigned = assignSections({ ...Object.fromEntries(qualified), reco: recoStores }, CURATION_MAX);
    const before = new Set<string>();
    const out: Sec[] = [];
    for (const id of SECTION_ORDER) {
      const list = assigned[id];
      if (id === "reco") {
        if (list.length > 0) out.push(recoSec(list));
      } else {
        const c = CURATIONS.find((x) => x.theme === id);
        const q = qualified.get(id) ?? [];
        if (c && list.length > 0) out.push({ theme: id, title: c.title(areaTitle), sub: c.sub, list, total: q.length, shownElsewhere: q.filter((st) => before.has(st.id)).length });
      }
      for (const st of list) before.add(st.id);
    }
    return { sections: out, reasons: reasonMap };
  }, [theme, themed, pool, areaTitle, themeLabel, recoRecords]);

  return (
    <div className="feed">
      <h1 className="visually-hidden">{region} 결제 데이터로 고르는 가게</h1>
      <div className="feed__filters">
        <RegionChips
          regions={regions}
          current={nameOnly ? NO_SCOPE : scope}
          near={nearShown}
          locating={geo.locating}
          hrefFor={regionHref}
          onNear={onNear}
          onMap={mapShown ? onMap : undefined}
          panelId={regionPanelId}
          panelOpen={regionPanel !== null}
          onAdd={() => setRegionPanel((m) => (m ? null : "add"))}
        />
        {regionPanel ? <RegionPanel id={regionPanelId} mode={regionPanel} regions={regions} onMode={setRegionPanel} onClose={closeRegionPanel} onGo={goRegion} /> : null}
        <ThemeChips theme={theme} onTheme={pickTheme} exclude={exclude} onExclude={toggleExclude} />
      </div>

      {message ? (
        <div className="feed__msg">
          <p className="feed__msg-text" role="status">
            {message}
          </p>
          <div className="feed__msg-act">
            <button type="button" className="link link--btn" onClick={focusSearch}>
              지역 직접 입력
            </button>
            <button
              type="button"
              className="feed__close"
              onClick={() => {
                setMessage(null);
                focusRegions();
              }}
              aria-label="위치 안내 닫기"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      <p className="feed__loading" role="status">
        결제 데이터를 불러오는 중입니다.
      </p>

      {search && !regionNamed ? (
        <SearchResults
          search={search}
          within={search.scopeTitle ? (nearShown ? "내 주변" : `${search.scopeTitle} 주변`) : null}
          basis={origin?.label ?? null}
          clearHref={search.scopeTitle ? homeHref(scope, { near: h.near, excludeFranchise: exclude, theme, sort }) : undefined}
          feedNote={nameOnly ? null : region}
          exclude={exclude}
          distanceOf={distanceOf}
          onPick={openStore}
          onShowChains={toggleExclude}
          selectedId={selectedId}
        />
      ) : null}

      {nameOnly ? (
        nameMapped.length > 0 ? (
          <MapSection
            ref={mapRef}
            stores={nameMapped}
            origin={origin?.point ?? null}
            originLabel={origin?.label ?? ""}
            focus={null}
            me={geo.me}
            near={false}
            locateState={locateState}
            onLocate={onLocate}
            selectedId={selectedId}
            onOpen={openStore}
            sort={sort}
            onSort={pickSort}
          />
        ) : null
      ) : !dataset ? (
        <div className="state state--error" role="alert">
          <h2 className="state__h">결제 데이터를 불러오지 못했습니다.</h2>
          <p>{scopeName(scope)} 조회가 실패했습니다. 잠시 뒤 다시 시도하거나 다른 지역을 골라 보세요.</p>
          <button type="button" className="btn btn--quiet" onClick={focusRegions}>
            지역 바꾸기
          </button>
        </div>
      ) : all.length === 0 ? (
        <div className="state">
          <h2 className="state__h">{h.food ? `${scopeName(scope)}에서 ${foodDisplayName(h.food)} 업종 가게를 찾지 못했습니다.` : `${scopeName(scope)}에서 결제 데이터를 찾지 못했습니다.`}</h2>
          <p>
            지금 조건: 지역 {scopeName(scope)}
            {h.food ? `, 음식 ${h.foodTerm}` : ""}. 다른 지역을 고르거나 검색어를 바꿔 보세요.
          </p>
          <button type="button" className="btn btn--quiet" onClick={focusRegions}>
            지역 바꾸기
          </button>
        </div>
      ) : pool.length === 0 ? (
        <div className="state">
          <h2 className="state__h">프랜차이즈를 빼면 남는 곳이 없습니다.</h2>
          <p>
            전체 {all.length}곳, 모두 프랜차이즈
          </p>
          <button type="button" className="btn btn--quiet" onClick={toggleExclude}>
            프랜차이즈 제외 끄기
          </button>
        </div>
      ) : (
        <>
          <div className="feed__top">
            <Briefing region={region} example={h.isDefault && !h.q} data={brief} exclude={exclude} mapNote={mapNote} analysisHref={analysisHref(scope, h.food, exclude)} />
            <TasteSummary />
          </div>

          {theme !== "all" && themed.length === 0 ? (
            <div className="state" data-testid="empty-theme">
              <h2 className="state__h">
                {region}에서 {themeLabel} 조건에 맞는 매장이 없습니다.
              </h2>
              <p>전체 {pool.length}곳</p>
              <div className="state__act">
                <button type="button" className="btn btn--primary" onClick={() => pickTheme("all")}>
                  테마 해제
                </button>
                <button type="button" className="btn btn--quiet" onClick={focusRegions}>
                  지역 바꾸기
                </button>
              </div>
            </div>
          ) : sections.length === 0 ? (
            <p className="feed__none">매출 상위 1%, 동네맛집, 회식 적합 0곳</p>
          ) : (
            sections.map((c, i) => (
              <Curation
                key={`${c.theme}|${region}|${exclude ? 1 : 0}`}
                theme={c.theme}
                title={c.title}
                sub={c.sub}
                stores={c.list}
                total={c.total}
                shownElsewhere={c.shownElsewhere}
                distanceOf={distanceOf}
                onOpen={openStore}
                activeId={selectedId}
                priority={i === 0}
                reasons={c.theme === "reco" ? reasons : undefined}
              />
            ))
          )}

          {themed.length > 0 ? (
            <MapSection
              ref={mapRef}
              stores={themed}
              origin={origin?.point ?? null}
              originLabel={origin?.label ?? ""}
              focus={focus}
              me={geo.me}
              near={nearShown}
              locateState={locateState}
              onLocate={onLocate}
              selectedId={selectedId}
              onOpen={openStore}
              sort={sort}
              onSort={pickSort}
              onAreaSearch={searchArea}
              onPanView={onPanView}
              panStores={panShown}
              onPanPick={openPanned}
            />
          ) : null}
        </>
      )}

      {search && regionNamed ? (
        <SearchResults
          search={search}
          aux
          clearHref={homeHref(scope, { excludeFranchise: exclude, theme, sort })}
          feedNote={null}
          exclude={exclude}
          distanceOf={distanceOf}
          onPick={openStore}
          onShowChains={toggleExclude}
          selectedId={selectedId}
        />
      ) : null}

      {selected && peakOpen ? (
        <Sheet kicker={evidenceLabel(selected, "peak")} title={displayName(selected.name)} onClose={() => setPeakOpen(false)}>
          <div className="evs">
            <EvidenceChart store={selected} kind="peak" stores={pool} scopeLabel={dataset?.scopeLabel ?? region} />
            <MerLink merUrl={selected.merUrl} className="cta evs__cta" />
            <button type="button" className="btn btn--quiet evs__receipt" onClick={() => setPeakOpen(false)}>
              결제 영수증 보기
            </button>
          </div>
        </Sheet>
      ) : null}
      {selected ? (
        <Receipt
          store={selected}
          distance={distanceLabel(distanceOf(selected))}
          distanceBasis={origin ? `${origin.label} 기준` : null}
          onClose={close}
          live={selectedLive}
          onPeak={() => {
            // 영수증은 그대로 두고 그 위에 차트 시트를 연다. Esc 한 번은 시트만, 두 번째는 영수증을 닫는다.
            setPeakOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}

function SearchResults({
  search,
  aux = false,
  within = null,
  basis = null,
  clearHref = "/",
  feedNote,
  exclude,
  distanceOf,
  onPick,
  onShowChains,
  selectedId,
}: {
  search: SearchState;
  /** 지역 홈 아래 보조 섹션(그 낱말이 이름에 들어간 가게). 0곳이나 실패면 그리지 않는다 */
  aux?: boolean;
  /** 범위 안 이름 검색의 범위 표기(강남역 주변, 내 주변). 있으면 제목과 안내를 그 범위로 쓴다 */
  within?: string | null;
  /** 거리 기준점 이름(내 위치, 강남역 중심). 범위 안 검색의 가까운 순 안내에 쓴다 */
  basis?: string | null;
  /** 검색 지우기 주소(보조 섹션과 범위 안 검색이면 지금 지역 홈) */
  clearHref?: string;
  /** 아래 피드의 지역 이름. 피드가 없으면(이름만 검색) null */
  feedNote: string | null;
  exclude: boolean;
  distanceOf: (s: Store) => number | null;
  onPick: (s: Store, trigger: HTMLElement) => void;
  onShowChains: () => void;
  selectedId: string | null;
}) {
  const [more, setMore] = useState(SEARCH_PAGE);
  const filtered = exclude ? search.stores.filter((s) => !s.franchise) : search.stores;
  const hidden = search.stores.length - filtered.length;
  // 지점이 여럿이면 지금 거리 기준에서 가까운 순으로 보여 준다.
  const shown = filtered
    .map((s, i) => ({ s, i, d: distanceOf(s) }))
    .sort((a, b) => (a.d ?? Number.POSITIVE_INFINITY) - (b.d ?? Number.POSITIVE_INFINITY) || a.i - b.i);
  if (aux && search.status !== "ok") return null;
  const label = aux ? `'${search.query}' 이름이 들어간 가게` : within ? `${within} ${search.query}` : `${search.query} 검색`;
  // 범위 안 검색은 제목에 범위가 있어 피드 안내를 붙이지 않는다.
  const after = feedNote && !within ? ` 아래 피드는 ${feedNote}입니다.` : "";
  return (
    <section className="found" aria-labelledby="found-h" data-testid="search-results">
      <div className="found__head">
        <h2 id="found-h" className="found__h">
          {search.status === "error"
            ? `${search.query} 검색 실패`
            : search.status === "empty"
              ? `${within ? `${within} ` : ""}${search.query} 검색 결과 없음`
              : shown.length === 0
                ? `${label}, 프랜차이즈 ${hidden}곳 숨김`
                : `${label} ${shown.length}곳`}
        </h2>
        <NavLink href={clearHref} className="link">
          검색 지우기
        </NavLink>
      </div>
      {search.status === "error" ? (
        <p className="found__p" role="alert">
          가게 검색이 실패했습니다. 잠시 뒤 다시 시도해 주세요.{after}
        </p>
      ) : search.status === "empty" ? (
        within ? (
          <p className="found__p">
            {within}에서 {search.query} 이름의 가게를 찾지 못했습니다.
          </p>
        ) : (
          <p className="found__p">이 이름의 가게를 찾지 못했습니다. 이름을 줄이거나 동네, 역 이름과 함께 검색해 보세요.{after}</p>
        )
      ) : (
        <>
          {hidden > 0 ? (
            <p className="found__p">
              프랜차이즈 제외가 켜져 있어 {hidden}곳을 숨겼습니다.{" "}
              <button type="button" className="link link--btn" onClick={onShowChains}>
                프랜차이즈 제외 끄기
              </button>
            </p>
          ) : null}
          {within ? (
            basis && shown.length > 1 ? <p className="found__p">{basis} 기준 가까운 순입니다.</p> : null
          ) : shown.length > 1 && !aux ? (
            <p className="found__p">지점이 여러 곳입니다. 지역과 주소를 보고 고르세요.</p>
          ) : null}
          {shown.length > 0 ? (
            <ul className="found__list">
              {shown.slice(0, more).map(({ s, d }) => (
                <li key={s.id}>
                  <button type="button" className="found__btn" aria-pressed={s.id === selectedId} aria-haspopup="dialog" onClick={(e) => onPick(s, e.currentTarget)}>
                    <span className="found__name">{displayName(s.name)}</span>
                    <span className="found__addr">
                      {s.address || s.sigungu}
                      {d !== null ? <span className="num">, {distanceLabel(d)}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {shown.length > more ? (
            <button type="button" className="btn btn--quiet found__more" onClick={() => setMore((n) => n + SEARCH_PAGE)}>
              더 보기, {shown.length - more}곳 남음
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
