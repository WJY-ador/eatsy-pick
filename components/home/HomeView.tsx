"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MerLink } from "@/components/MerLink";
import { NavLink, setNavPending } from "@/components/NavLink";
import { StoreMap } from "@/components/StoreMap";
import { MyRecords, NextPlan, StoreSignal } from "@/components/visits";
import { AREAS } from "@/lib/areas";
import { currentPosition, geolocationGranted, getGeo, type LocateError, setGeo, useGeo } from "@/lib/geo-state";
import { GEOCODE_CREDIT, NOMINATIM_ON, type PresetPoint, nominatimGeocoder, presetGeocoder, reverseGeocode } from "@/lib/geocode";
import { type HomeQuery, type HomeScope, analysisHref, homeHref, looksLikePlace, presetFor } from "@/lib/home-params";
import { GEO_NOTICE, GEO_NOTICE_LOCAL } from "@/lib/site";
import { displayName, distanceLabel, distanceM, peakOf } from "@/lib/store-view";
import type { AreaDataset, Store } from "@/lib/stores";
import { Receipt } from "./Receipt";

export type SearchState = { status: "ok" | "empty" | "error"; query: string; stores: Store[] };
export type HomeData = { query: HomeQuery; dataset: AreaDataset | null; search: SearchState | null; presets: PresetPoint[] };

/** 빠른 상권 칩(사용자 지정 순서) */
const CHIPS = ["gangnam", "yeouido", "seongsu", "euljiro", "pangyo"].map((slug) => AREAS.find((a) => a.slug === slug)!);
const PAGE = 20;

const LOCATE_FAIL: Record<LocateError | "geocode", string> = {
  denied: "위치 권한이 거부되어 지금 화면을 유지합니다.",
  timeout: "위치 확인 시간이 지나 지금 화면을 유지합니다.",
  unsupported: "이 브라우저에서는 위치를 쓸 수 없어 지금 화면을 유지합니다.",
  unavailable: "위치를 확인하지 못해 지금 화면을 유지합니다.",
  geocode: "지금 위치 근처는 아직 준비된 상권이 없습니다. 동네 이름으로 검색해 주세요.",
};

type Origin = { point: { lat: number; lng: number }; label: string } | null;

function centroid(stores: Store[]): { lat: number; lng: number } | null {
  const pts = stores.filter((s) => s.lat !== null && s.lng !== null);
  if (pts.length === 0) return null;
  return { lat: pts.reduce((a, s) => a + (s.lat as number), 0) / pts.length, lng: pts.reduce((a, s) => a + (s.lng as number), 0) / pts.length };
}

/** 행 오른쪽 매장 근거(방문 기록이 없을 때): 회식 적합 표시 → 동네맛집 표시 */
function storeFallback(s: Store): string | null {
  if (s.hoesik === true) return "회식 적합 표시";
  if (s.local === true) return "동네맛집 표시";
  return null;
}

function whyLine(s: Store): string | null {
  const parts: string[] = [];
  const peak = peakOf(s);
  if (peak) parts.push(`대표 피크 ${peak}`);
  if (s.hoesik === true && s.local === true) parts.push("동네맛집 표시");
  return parts.length ? parts.join(", ") : null;
}

export function HomeView({ data }: { data: HomeData }) {
  const { query: h, dataset, search, presets } = data;
  const router = useRouter();
  const geo = useGeo();
  const [isPending, startTransition] = useTransition();
  const [exclude, setExclude] = useState(h.excludeFranchise);
  const [sort, setSort] = useState<"dist" | "rank">(h.sort);
  const [view, setView] = useState<"list" | "map">("list");
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState<string | null>(null);
  const [extra, setExtra] = useState<Map<string, Store>>(() => new Map());
  const initialSelected = useMemo(() => {
    if (h.id) return h.id;
    if (search?.status === "ok" && search.stores.length === 1) return search.stores[0].id;
    return null;
  }, [h.id, search]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const lastTrigger = useRef<HTMLElement | null>(null);

  // 이동 대기 표시(스켈레톤)는 트랜지션이 진행 중일 때만 켠다.
  useEffect(() => {
    if (!isPending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [isPending]);

  const go = useCallback((href: string, replace = false) => startTransition(() => (replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false }))), [router]);

  const scope: HomeScope = h.scope;
  const nearShown = h.near && geo.me !== null;

  // 상태를 URL에만 반영한다(history). 서버를 다시 부르지 않는다.
  const syncUrl = useCallback(
    (o: { id?: string | null; exclude?: boolean; sort?: "dist" | "rank" }) => {
      const href = homeHref(scope, {
        near: nearShown,
        q: h.q,
        id: o.id === undefined ? selectedId : o.id,
        excludeFranchise: o.exclude ?? exclude,
        sort: o.sort ?? sort,
      });
      // 예시 상권(쿼리 없는 첫 진입)은 area를 붙이지 않는다. 새로고침해도 예시 표기와 진입 시 위치 확인이 유지된다.
      const out = h.isDefault ? href.replace(/^\/\?area=[^&]*&?/, "/?").replace(/\?$/, "") || "/" : href;
      window.history.replaceState(window.history.state, "", out);
    },
    [scope, nearShown, h.q, h.isDefault, selectedId, exclude, sort],
  );

  // ----- 내 주변 -----
  const locate = useCallback(
    async (mode: "auto" | "click") => {
      if (getGeo().locating) return;
      setGeo({ locating: true });
      if (mode === "click") setMessage(null);
      let pos: { lat: number; lng: number };
      try {
        pos = await currentPosition();
      } catch (e) {
        setGeo({ locating: false });
        setMessage(LOCATE_FAIL[(e as LocateError) in LOCATE_FAIL ? (e as LocateError) : "unavailable"]);
        return;
      }
      const chain = NOMINATIM_ON ? [nominatimGeocoder, presetGeocoder(presets)] : [presetGeocoder(presets)];
      const place = await reverseGeocode(pos.lat, pos.lng, chain);
      if (!place || (!place.presetSlug && !place.dong && !place.gu)) {
        setGeo({ locating: false });
        setMessage(LOCATE_FAIL.geocode);
        return;
      }
      setGeo({ locating: false, me: pos, gu: place.gu, retriedGu: false });
      const next: HomeScope = place.presetSlug
        ? { kind: "area", slug: place.presetSlug, name: AREAS.find((a) => a.slug === place.presetSlug)?.name ?? "" }
        : { kind: "loc", loc: (place.dong ?? place.gu) as string };
      go(homeHref(next, { near: true, excludeFranchise: exclude, sort: "dist" }));
    },
    [presets, go, exclude],
  );

  // 권한이 이미 허용됐고 URL에 상권, 동네, 검색어가 없을 때만 진입 시 한 번 위치를 확인한다.
  useEffect(() => {
    if (!h.isDefault || h.q || h.id || getGeo().autoChecked) return;
    setGeo({ autoChecked: true });
    let alive = true;
    geolocationGranted().then((ok) => {
      if (alive && ok) void locate("auto");
    });
    return () => {
      alive = false;
    };
  }, [h.isDefault, h.q, h.id, locate]);

  // 동 조회가 0건이면 시군구로 한 번 다시 조회한다.
  useEffect(() => {
    if (!h.near || !dataset || dataset.stores.length > 0) return;
    const g = getGeo();
    if (!g.gu || g.retriedGu || (scope.kind === "loc" && scope.loc === g.gu)) return;
    setGeo({ retriedGu: true });
    go(homeHref({ kind: "loc", loc: g.gu }, { near: true, excludeFranchise: exclude }), true);
  }, [h.near, dataset, scope, go, exclude]);

  // ----- 목록 -----
  const all = useMemo(() => dataset?.stores ?? [], [dataset]);
  const visible = useMemo(() => (exclude ? all.filter((s) => !s.franchise) : all), [all, exclude]);

  const origin: Origin = useMemo(() => {
    if (geo.me) return { point: geo.me, label: "내 위치 기준" };
    if (dataset?.center) return { point: dataset.center, label: `${dataset.title} 중심 기준` };
    const c = centroid(all);
    return c ? { point: c, label: "조회 결과 중심 기준" } : null;
  }, [geo.me, dataset, all]);

  const rows = useMemo(() => {
    const withD = visible.map((s, i) => ({ s, i, d: origin ? distanceM(origin.point, s) : null }));
    if (sort === "dist") withD.sort((a, b) => (a.d ?? Number.POSITIVE_INFINITY) - (b.d ?? Number.POSITIVE_INFINITY) || a.i - b.i);
    return withD;
  }, [visible, origin, sort]);

  const byId = useMemo(() => {
    const m = new Map<string, Store>();
    for (const s of all) m.set(s.id, s);
    for (const s of search?.stores ?? []) if (!m.has(s.id)) m.set(s.id, s);
    for (const [id, s] of extra) if (!m.has(id)) m.set(id, s);
    return m;
  }, [all, search, extra]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const open = useCallback(
    (id: string) => {
      lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelectedId(id);
      syncUrl({ id });
    },
    [syncUrl],
  );
  const openStore = useCallback(
    (store: Store) => {
      setExtra((m) => (m.has(store.id) ? m : new Map(m).set(store.id, store)));
      open(store.id);
    },
    [open],
  );
  const close = useCallback(() => {
    setSelectedId(null);
    syncUrl({ id: null });
    const t = lastTrigger.current;
    if (t && document.contains(t)) t.focus();
  }, [syncUrl]);

  const toggleExclude = () => {
    const v = !exclude;
    setExclude(v);
    syncUrl({ exclude: v });
  };
  const changeSort = (v: "dist" | "rank") => {
    setSort(v);
    syncUrl({ sort: v });
  };

  // ----- 검색 -----
  const [value, setValue] = useState(h.q ?? "");
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = value.replace(/\s+/g, " ").trim();
    if (!v) return;
    const preset = presetFor(v);
    if (preset) return go(homeHref({ kind: "area", slug: preset, name: "" }, { excludeFranchise: exclude }));
    if (looksLikePlace(v)) return go(homeHref({ kind: "loc", loc: v.replace(/^(.+?)\d+동$/, "$1동") }, { excludeFranchise: exclude }));
    go(homeHref(scope, { near: nearShown, q: v, excludeFranchise: exclude, sort }));
  };

  const title = dataset ? (nearShown ? (scope.kind === "area" ? `내 주변 — ${dataset.title} 상권 조회` : `내 주변 — ${dataset.scopeLabel} 조회`) : dataset.title) : scope.kind === "area" ? scope.name : scope.loc;
  const sub = dataset && !nearShown ? `${h.isDefault ? "예시 상권, " : ""}조회 범위 ${dataset.scopeLabel}` : null;
  const activeSlug = scope.kind === "area" ? scope.slug : null;

  return (
    <div className="home__in">
      <section className="ctl" aria-label="검색과 상권">
        <form className="ctl__search" action="/" method="get" role="search" onSubmit={onSearch}>
          {scope.kind === "area" ? <input type="hidden" name="area" value={scope.slug} /> : <input type="hidden" name="loc" value={scope.loc} />}
          <label htmlFor="q" className="visually-hidden">
            가게명이나 동네
          </label>
          <input
            id="q"
            name="q"
            type="search"
            inputMode="search"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={40}
            placeholder="가게명이나 동네 검색"
            className="input ctl__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="button" className="btn btn--quiet ctl__near" onClick={() => void locate("click")} aria-busy={geo.locating ? "true" : undefined} disabled={geo.locating}>
            {geo.locating ? "확인 중" : "내 주변 보기"}
          </button>
        </form>
        <div className="ctl__row">
          <div className="chips" role="group" aria-label="빠른 상권">
            {CHIPS.map((a) => (
              <NavLink key={a.slug} href={homeHref({ kind: "area", slug: a.slug, name: a.name }, { excludeFranchise: exclude })} className="chip" current={activeSlug === a.slug && !nearShown}>
                {a.name}
              </NavLink>
            ))}
          </div>
        </div>
        {/* 위치 확인 결과 한 줄은 안내 문구 자리에 대신 놓는다(390 첫 화면에서 첫 후보를 밀어내지 않게). */}
        {message ? (
          <p className="ctl__msg" role="status">
            {message}
          </p>
        ) : (
          <p id="geo-notice" className="ctl__notice">
            {NOMINATIM_ON ? `${GEO_NOTICE} ${GEOCODE_CREDIT}` : GEO_NOTICE_LOCAL}
          </p>
        )}
      </section>

      <section className="sum" aria-labelledby="home-title">
        <div className="sum__head">
          <h1 id="home-title" className="sum__title">
            {title}
          </h1>
          <NavLink href={analysisHref(scope)} className="link sum__link">
            상권 분석
          </NavLink>
        </div>
        {sub ? <p className="sum__sub">{sub}</p> : null}
      </section>

      {search ? <SearchResults search={search} scope={scope} exclude={exclude} onPick={openStore} selectedId={selectedId} /> : null}

      <NextPlan stores={visible} title={dataset ? dataset.title : title} onOpen={openStore} />

      {!dataset ? (
        <div className="state state--error" role="alert">
          <h2 className="state__h">결제 데이터를 불러오지 못했습니다.</h2>
          <p>잇플 조회가 실패했습니다. 잠시 뒤 다시 시도하거나 다른 상권을 눌러 보세요.</p>
        </div>
      ) : all.length === 0 ? (
        <div className="state">
          <h2 className="state__h">이 범위에서 결제 데이터를 찾지 못했습니다.</h2>
          <p>동 이름을 바꾸거나 상권 칩을 눌러 보세요.</p>
        </div>
      ) : (
        <div className="board" data-view={view}>
          <div className="board__bar">
            <div className="seg" role="group" aria-label="보기">
              <button type="button" className="seg__btn board__viewbtn" aria-pressed={view === "list"} onClick={() => setView("list")}>
                목록
              </button>
              <button type="button" className="seg__btn board__viewbtn" aria-pressed={view === "map"} onClick={() => setView("map")}>
                지도
              </button>
            </div>
            <button type="button" className="toggle" aria-pressed={exclude} onClick={toggleExclude}>
              프랜차이즈 제외
            </button>
          </div>

          <div className="board__map">
            <StoreMap stores={visible} selectedId={selectedId} onSelect={open} me={geo.me} height={480} />
          </div>

          <div className="board__list">
            <div className="list__bar">
              <p className="list__count num">
                {visible.length}곳{origin && sort === "dist" ? `, 거리는 ${origin.label}` : ""}
              </p>
              <div className="seg" role="group" aria-label="정렬">
                <button type="button" className="seg__btn" aria-pressed={sort === "dist"} onClick={() => changeSort("dist")} disabled={!origin}>
                  거리순
                </button>
                <button type="button" className="seg__btn" aria-pressed={sort === "rank"} onClick={() => changeSort("rank")}>
                  매출 상위순
                </button>
              </div>
            </div>
            {visible.length === 0 ? (
              <div className="state">
                <h2 className="state__h">프랜차이즈를 빼면 남는 곳이 없습니다.</h2>
                <p>프랜차이즈 제외를 끄면 같은 조회 결과에서 다시 보입니다.</p>
              </div>
            ) : (
              <ol className="rows">
                {rows.slice(0, shown).map(({ s, d }) => (
                  <StoreRow key={s.id} store={s} distance={distanceLabel(d)} selected={s.id === selectedId} onOpen={open} />
                ))}
              </ol>
            )}
            {rows.length > shown ? (
              <button type="button" className="btn btn--quiet list__more" onClick={() => setShown((n) => n + PAGE)}>
                더 보기, {rows.length - shown}곳 남음
              </button>
            ) : null}
            <p className="list__src num">
              API 반환 {dataset.returned}곳{dataset.hitLimit ? "(호출당 반환 한도 100곳에 도달)" : ""}, 중복 정리 뒤 {all.length}곳
              {dataset.failed > 0 ? `, 조회 ${dataset.failed}건 실패` : ""}
            </p>
          </div>
        </div>
      )}

      <MyRecords onOpen={openStore} />

      {selected ? <Receipt store={selected} distance={origin ? distanceLabel(distanceM(origin.point, selected)) : null} distanceBasis={origin?.label ?? null} onClose={close} /> : null}
    </div>
  );
}

function StoreRow({ store, distance, selected, onOpen }: { store: Store; distance: string | null; selected: boolean; onOpen: (id: string) => void }) {
  const why = whyLine(store);
  const fb = storeFallback(store);
  return (
    <li className="row" data-selected={selected ? "true" : undefined}>
      <div className="row__main">
        <button type="button" className="row__name" onClick={() => onOpen(store.id)} aria-haspopup="dialog">
          {displayName(store.name)}
        </button>
        <p className="row__meta">
          {distance ? <span className="num">{distance}</span> : null}
          {distance ? ", " : ""}
          {store.category}
        </p>
        {why ? <p className="row__why">{why}</p> : null}
      </div>
      <div className="row__side">
        <StoreSignal store={store} fallback={fb ? <span className="row__fact">{fb}</span> : undefined} />
      </div>
      <MerLink merUrl={store.merUrl} className="cta row__cta" />
    </li>
  );
}

function SearchResults({
  search,
  scope,
  exclude,
  onPick,
  selectedId,
}: {
  search: SearchState;
  scope: HomeScope;
  exclude: boolean;
  onPick: (s: Store) => void;
  selectedId: string | null;
}) {
  const clear = homeHref(scope, { excludeFranchise: exclude });
  return (
    <section className="found" aria-labelledby="found-h">
      <div className="found__head">
        <h2 id="found-h" className="found__h">
          {search.status === "error" ? `${search.query} 검색 실패` : search.status === "empty" ? `${search.query} 검색 결과 없음` : `${search.query} 검색 ${search.stores.length}곳`}
        </h2>
        <NavLink href={clear} className="link">
          검색 지우기
        </NavLink>
      </div>
      {search.status === "error" ? (
        <p className="found__p" role="alert">
          매장 검색 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요. 지금 상권 목록은 그대로입니다.
        </p>
      ) : search.status === "empty" ? (
        <p className="found__p">이 이름의 가게를 찾지 못했습니다. 이름을 줄이거나 동 이름과 함께 검색해 보세요.</p>
      ) : search.stores.length > 1 ? (
        <>
          <p className="found__p">지점이 여러 곳입니다. 주소를 보고 고르세요.</p>
          <ul className="found__list">
            {search.stores.map((s) => (
              <li key={s.id}>
                <button type="button" className="found__btn" aria-pressed={s.id === selectedId} onClick={() => onPick(s)}>
                  <span className="found__name">{displayName(s.name)}</span>
                  <span className="found__addr">{s.address}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
