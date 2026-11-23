"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { EvidenceChart } from "@/components/evidence";
import { MerLink } from "@/components/MerLink";
import { NavLink, setNavPending } from "@/components/NavLink";
import { Sheet } from "@/components/Sheet";
import { StoreMap } from "@/components/StoreMap";
import { StoreSignalDetail } from "@/components/visits";
import { AREAS } from "@/lib/areas";
import { type EvidenceKind, evidenceLabel } from "@/lib/evidence";
import { currentPosition, geolocationGranted, getGeo, type LocateError, setGeo, useGeo } from "@/lib/geo-state";
import { NOMINATIM_ON, type PresetPoint, nominatimGeocoder, presetGeocoder, reverseGeocode } from "@/lib/geocode";
import { type HomeQuery, type HomeScope, analysisHref, homeHref, looksLikePlace, presetFor } from "@/lib/home-params";
import { customerLabel } from "@/lib/labels";
import { displayName, distanceLabel, distanceM, percentLabel } from "@/lib/store-view";
import type { AreaDataset, Store } from "@/lib/stores";
import { GEO_TIP, TAGLINE } from "@/lib/site";
import { setHomeContext } from "@/lib/ui-state";
import { useVisitRecord } from "@/lib/visits";
import { Receipt } from "./Receipt";

export type SearchState = { status: "ok" | "empty" | "error"; query: string; stores: Store[] };
export type HomeData = { query: HomeQuery; dataset: AreaDataset | null; search: SearchState | null; presets: PresetPoint[] };

/** 빠른 상권 칩(사용자 지정 순서) */
const CHIPS = ["gangnam", "yeouido", "seongsu", "euljiro", "pangyo"].map((slug) => AREAS.find((a) => a.slug === slug)!);
/** 지도와 목록에 쓰는 가까운 후보 최대 수 */
const MAX_NEAR = 100;
/** 상호 검색 결과를 한 번에 보여 주는 수 */
const SEARCH_PAGE = 8;
/** 거리 구간: [이상, 미만) m */
const BANDS: { label: string; min: number; max: number }[] = [
  { label: "300m 이내", min: 0, max: 300 },
  { label: "300~600m", min: 300, max: 600 },
  { label: "600m~1km", min: 600, max: 1000 },
  { label: "1km 이상", min: 1000, max: Number.POSITIVE_INFINITY },
];

const LOCATE_FAIL: Record<LocateError | "geocode", string> = {
  denied: "위치 권한이 거부되어 보던 지역을 유지합니다. 동네 이름으로 검색할 수 있습니다.",
  timeout: "위치 확인 시간이 지나 보던 지역을 유지합니다. 동네 이름으로 검색할 수 있습니다.",
  unsupported: "이 브라우저에서는 위치를 쓸 수 없어 보던 지역을 유지합니다.",
  unavailable: "위치를 확인하지 못해 보던 지역을 유지합니다. 동네 이름으로 검색할 수 있습니다.",
  geocode: "지금 위치 근처는 아직 준비된 상권이 없습니다. 동네 이름으로 검색해 주세요.",
};

type Origin = { point: { lat: number; lng: number }; label: string } | null;
type Evidence = { store: Store; kind: EvidenceKind | "mine" };

function centroid(stores: Store[]): { lat: number; lng: number } | null {
  const pts = stores.filter((s) => s.lat !== null && s.lng !== null);
  if (pts.length === 0) return null;
  return { lat: pts.reduce((a, s) => a + (s.lat as number), 0) / pts.length, lng: pts.reduce((a, s) => a + (s.lng as number), 0) / pts.length };
}

function bandOf(d: number): number {
  return BANDS.findIndex((b) => d >= b.min && d < b.max);
}

export function HomeView({ data }: { data: HomeData }) {
  const { query: h, dataset, search, presets } = data;
  const router = useRouter();
  const geo = useGeo();
  const [isPending, startTransition] = useTransition();
  const [exclude, setExclude] = useState(h.excludeFranchise);
  const [band, setBand] = useState<number | null>(h.band);
  const [message, setMessage] = useState<string | null>(null);
  const [extra, setExtra] = useState<Map<string, Store>>(() => new Map());
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const initialSelected = useMemo(() => {
    if (h.id) return h.id;
    // 상호 검색이 한 곳으로 좁혀지면(프랜차이즈 제외를 적용한 뒤) 영수증을 바로 연다.
    const shownSearch = search?.status === "ok" ? search.stores.filter((st) => !(h.excludeFranchise && st.franchise)) : [];
    if (shownSearch.length === 1) return shownSearch[0].id;
    return null;
  }, [h.id, h.excludeFranchise, search]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);
  const [mapPick, setMapPick] = useState<string | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);

  // 이동 대기 표시는 트랜지션이 진행 중일 때만 켠다.
  useEffect(() => {
    if (!isPending) return;
    setNavPending(true);
    return () => setNavPending(false);
  }, [isPending]);

  const go = useCallback((href: string, replace = false) => startTransition(() => (replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false }))), [router]);

  const scope: HomeScope = h.scope;
  const nearShown = h.near && geo.me !== null;
  const q = h.q ?? h.foodTerm;

  // 상태를 URL에만 반영한다(history). 서버를 다시 부르지 않는다.
  const syncUrl = useCallback(
    (o: { id?: string | null; exclude?: boolean; band?: number | null }) => {
      const href = homeHref(scope, {
        near: nearShown,
        q,
        id: o.id === undefined ? selectedId : o.id,
        excludeFranchise: o.exclude ?? exclude,
        band: o.band === undefined ? band : o.band,
      });
      // 예시 상권(쿼리 없는 첫 진입)은 area를 붙이지 않는다. 새로고침해도 예시 표기와 진입 시 위치 확인이 유지된다.
      const out = h.isDefault ? href.replace(/^\/\?area=[^&]*&?/, "/?").replace(/\?$/, "") || "/" : href;
      window.history.replaceState(window.history.state, "", out);
    },
    [scope, nearShown, q, h.isDefault, selectedId, exclude, band],
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
      go(homeHref(next, { near: true, excludeFranchise: exclude }));
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

  // ----- 후보 집합: 중복 정리된 조회 결과 → 프랜차이즈 필터 → 거리 → 거리 구간 → 가까운 순 최대 100곳 -----
  const all = useMemo(() => dataset?.stores ?? [], [dataset]);
  const visible = useMemo(() => (exclude ? all.filter((s) => !s.franchise) : all), [all, exclude]);
  const hiddenCount = all.length - visible.length;

  const origin: Origin = useMemo(() => {
    if (geo.me) return { point: geo.me, label: "내 위치 기준" };
    if (dataset?.center) return { point: dataset.center, label: `${dataset.title} 중심 기준` };
    const c = centroid(all);
    return c ? { point: c, label: "조회 결과 중심 기준" } : null;
  }, [geo.me, dataset, all]);

  const placed = useMemo(() => {
    if (!origin) return [];
    return visible
      .map((s, i) => ({ s, i, d: distanceM(origin.point, s) }))
      .filter((r): r is { s: Store; i: number; d: number } => r.d !== null)
      .sort((a, b) => a.d - b.d || a.i - b.i);
  }, [visible, origin]);
  const noCoords = visible.length - placed.length;
  const bandCounts = useMemo(() => BANDS.map((_, k) => placed.filter((r) => bandOf(r.d) === k).length), [placed]);
  const near = useMemo(() => (band === null ? placed : placed.filter((r) => bandOf(r.d) === band)).slice(0, MAX_NEAR), [placed, band]);
  const nearStores = useMemo(() => near.map((r) => r.s), [near]);
  const filteredTotal = band === null ? placed.length : bandCounts[band];

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
      setEvidence(null);
      setSelectedId(id);
      setMapPick(id);
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

  // 헤더의 내 기록 시트가 지금 후보와 영수증 열기를 쓴다.
  const title = dataset
    ? nearShown
      ? scope.kind === "area"
        ? `내 주변 — ${dataset.title} 상권 조회`
        : `내 주변 — ${dataset.scopeLabel} 조회`
      : dataset.title
    : scope.kind === "area"
      ? scope.name
      : scope.loc;
  useEffect(() => {
    setHomeContext({ stores: visible, title: dataset?.title ?? title, open: openStore });
    return () => setHomeContext(null);
  }, [visible, dataset, title, openStore]);

  const toggleExclude = () => {
    const v = !exclude;
    setExclude(v);
    // 상호 검색이 토글 뒤 한 곳으로 좁혀지면 그 영수증을 연다.
    const left = search?.status === "ok" ? search.stores.filter((st) => !(v && st.franchise)) : [];
    if (left.length === 1 && !selectedId) {
      setSelectedId(left[0].id);
      syncUrl({ exclude: v, id: left[0].id });
      return;
    }
    syncUrl({ exclude: v });
  };
  const pickBand = (k: number) => {
    const v = band === k ? null : k;
    setBand(v);
    syncUrl({ band: v });
  };

  // ----- 검색: 상권 이름 → 동네 → 음식(업종) → 상호 -----
  const [value, setValue] = useState(q ?? "");
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = value.replace(/\s+/g, " ").trim();
    if (!v) return;
    const preset = presetFor(v);
    if (preset) return go(homeHref({ kind: "area", slug: preset, name: "" }, { excludeFranchise: exclude }));
    if (looksLikePlace(v)) return go(homeHref({ kind: "loc", loc: v.replace(/^(.+?)\d+동$/, "$1동") }, { excludeFranchise: exclude }));
    // 음식과 상호는 지금 범위를 유지한다(음식은 서버가 업종 조회로 읽는다).
    go(homeHref(scope, { near: nearShown, q: v, excludeFranchise: exclude }));
  };

  const activeSlug = scope.kind === "area" ? scope.slug : null;
  const where = dataset ? dataset.scopeLabel : null;
  const countLine =
    filteredTotal > MAX_NEAR ? `조회된 매장 ${filteredTotal}곳 중 가까운 순 ${near.length}곳` : `조회된 매장 ${near.length}곳, 가까운 순`;

  return (
    <div className="home__in">
      <section className="ctl" aria-label="검색과 상권">
        <p className="ctl__lede">{TAGLINE}</p>
        <form className="ctl__search" action="/" method="get" role="search" onSubmit={onSearch}>
          {scope.kind === "area" ? <input type="hidden" name="area" value={scope.slug} /> : <input type="hidden" name="loc" value={scope.loc} />}
          <label htmlFor="q" className="visually-hidden">
            음식, 가게, 동네 검색
          </label>
          <input
            id="q"
            name="q"
            type="search"
            inputMode="search"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={40}
            placeholder="음식, 가게, 동네 검색"
            className="input ctl__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--quiet ctl__near"
            onClick={() => void locate("click")}
            aria-busy={geo.locating ? "true" : undefined}
            disabled={geo.locating}
            title={GEO_TIP}
            aria-describedby="geo-tip"
          >
            {geo.locating ? "확인 중" : "내 주변 보기"}
          </button>
          <span id="geo-tip" className="visually-hidden">
            {GEO_TIP}
          </span>
        </form>
        <div className="chips" role="group" aria-label="빠른 상권">
          {CHIPS.map((a) => (
            <NavLink key={a.slug} href={homeHref({ kind: "area", slug: a.slug, name: a.name }, { excludeFranchise: exclude })} className="chip" current={activeSlug === a.slug && !nearShown && !h.food}>
              {a.name}
            </NavLink>
          ))}
        </div>
        {message ? (
          <p className="ctl__msg" role="status">
            {message}
          </p>
        ) : null}
      </section>

      {search ? <SearchResults search={search} scope={scope} exclude={exclude} origin={origin} onPick={openStore} onShowChains={toggleExclude} selectedId={selectedId} /> : null}

      {!dataset ? (
        <div className="state state--error" role="alert">
          <h1 className="state__h">결제 데이터를 불러오지 못했습니다.</h1>
          <p>잇플 조회가 실패했습니다. 잠시 뒤 다시 시도하거나 다른 상권을 눌러 보세요.</p>
        </div>
      ) : (
        <div className="near">
          <section className="sum" aria-labelledby="home-title">
            <h1 id="home-title" className="sum__title">
              {h.food ? `${dataset.title}, ${h.food} 업종 ${visible.length}곳` : title}
            </h1>
            <div className="sum__row">
              <p className="sum__sub">
                {where}에서 {countLine}
                {origin ? `, ${origin.label}` : ""}
              </p>
              <button type="button" className="toggle" aria-pressed={exclude} onClick={toggleExclude}>
                프랜차이즈 제외
              </button>
            </div>
            {exclude && hiddenCount > 0 && (h.food || all.length === hiddenCount) ? (
              <p className="sum__hide">
                프랜차이즈 제외가 켜져 있어 {hiddenCount}곳을 숨겼습니다. 끄면 볼 수 있습니다.{" "}
                <button type="button" className="link link--btn" onClick={toggleExclude}>
                  프랜차이즈 제외 끄기
                </button>
              </p>
            ) : null}
            {placed.length > 0 ? <DistanceBar counts={bandCounts} band={band} onPick={pickBand} basis={origin?.label ?? ""} /> : null}
          </section>

          {all.length === 0 ? (
            <div className="state">
              <h2 className="state__h">{h.food ? `이 범위에서 ${h.food} 업종 가게를 찾지 못했습니다.` : "이 범위에서 결제 데이터를 찾지 못했습니다."}</h2>
              <p>동 이름을 바꾸거나 상권 칩을 눌러 보세요.</p>
            </div>
          ) : (
            <div className="near__body">
              <div className="near__map">
                <StoreMap stores={nearStores} selectedId={mapPick} onSelect={open} me={geo.me} height={260} />
              </div>
              <div className="near__list">
                {near.length === 0 ? (
                  <div className="state">
                    <h2 className="state__h">{visible.length === 0 ? "프랜차이즈를 빼면 남는 곳이 없습니다." : "이 거리 구간에는 후보가 없습니다."}</h2>
                    <p>{visible.length === 0 ? "프랜차이즈 제외를 끄면 같은 조회 결과에서 다시 보입니다." : "거리 구간을 다시 누르면 풀립니다."}</p>
                  </div>
                ) : (
                  <ol className="rows" aria-label={countLine}>
                    {near.map(({ s, d }) => (
                      <StoreRow key={s.id} store={s} distance={distanceLabel(d)} selected={s.id === mapPick} onOpen={open} onEvidence={(kind) => setEvidence({ store: s, kind })} />
                    ))}
                  </ol>
                )}
                {noCoords > 0 ? <p className="list__src">위치 정보가 없는 {noCoords}곳은 지도와 목록에서 뺐습니다.</p> : null}
                <NavLink href={analysisHref(scope)} className="link near__more">
                  이 지역 상권 분석 보기
                </NavLink>
              </div>
            </div>
          )}
        </div>
      )}

      {evidence ? (
        <EvidenceSheet
          evidence={evidence}
          stores={visible}
          scopeLabel={where ?? title}
          onClose={() => setEvidence(null)}
          onReceipt={() => open(evidence.store.id)}
        />
      ) : null}
      {selected ? (
        <Receipt
          store={selected}
          distance={origin ? distanceLabel(distanceM(origin.point, selected)) : null}
          distanceBasis={origin?.label ?? null}
          onClose={close}
          onPeak={() => {
            const st = selected;
            setSelectedId(null);
            setEvidence({ store: st, kind: "peak" });
          }}
        />
      ) : null}
    </div>
  );
}

function DistanceBar({ counts, band, onPick, basis }: { counts: number[]; band: number | null; onPick: (k: number) => void; basis: string }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="dist" role="group" aria-label={`거리 분포, ${basis}. 구간을 누르면 지도와 목록이 좁혀집니다`}>
      {BANDS.map((b, k) => (
        <button
          key={b.label}
          type="button"
          className="dist__seg"
          aria-pressed={band === k}
          disabled={counts[k] === 0 && band !== k}
          onClick={() => onPick(k)}
          aria-label={`${b.label} ${counts[k]}곳${band === k ? ", 선택됨" : ""}`}
        >
          <span className="dist__label">{b.label}</span>
          <span className="dist__n num">{counts[k]}곳</span>
          <span className="dist__track" aria-hidden="true">
            <span className="dist__fill" style={{ transform: `scaleX(${counts[k] / max})` }} />
          </span>
        </button>
      ))}
    </div>
  );
}

/** 근거 시트를 여는 태그 버튼(겉보기는 작고 히트 영역은 44px) */
function TagButton({ label, onClick, mine = false }: { label: string; onClick: () => void; mine?: boolean }) {
  return (
    <button type="button" className="taghit" onClick={onClick} aria-haspopup="dialog">
      <span className="tag tag--btn">
        {mine ? <span className="tag__dot" aria-hidden="true" /> : null}
        {label}
        <span className="tag__chev" aria-hidden="true" />
      </span>
    </button>
  );
}

/** 행의 태그 줄: 내가 다시 갈 곳 / 시군구 상위 N% / 고객층 1위 / 동네맛집 / 회식 적합 (있는 것만) */
function RowTags({ store, onEvidence }: { store: Store; onEvidence: (kind: EvidenceKind | "mine") => void }) {
  const rec = useVisitRecord(store.id);
  const mine = Boolean(rec && rec.reaction === "again" && rec.visits.length > 0);
  const cust = store.customers[0] ? customerLabel(store.customers[0]) : null;
  const tags: React.ReactNode[] = [];
  if (mine) tags.push(<TagButton key="mine" label="내가 다시 갈 곳" mine onClick={() => onEvidence("mine")} />);
  if (store.ccgRank !== null) tags.push(<TagButton key="rank" label={`${store.sigungu} 상위 ${percentLabel(store.ccgRank)}`} onClick={() => onEvidence("rank")} />);
  if (cust) tags.push(<span key="cust" className="tag tag--text">{cust} 1위</span>);
  if (store.local === true) tags.push(<TagButton key="local" label="동네맛집" onClick={() => onEvidence("local")} />);
  if (store.hoesik === true) tags.push(<TagButton key="hoesik" label="회식 적합" onClick={() => onEvidence("hoesik")} />);
  if (tags.length === 0) return null;
  return <div className="row__tags">{tags}</div>;
}

function StoreRow({
  store,
  distance,
  selected,
  onOpen,
  onEvidence,
}: {
  store: Store;
  distance: string | null;
  selected: boolean;
  onOpen: (id: string) => void;
  onEvidence: (kind: EvidenceKind | "mine") => void;
}) {
  return (
    <li className="row" data-selected={selected ? "true" : undefined} data-id={store.id}>
      <button type="button" className="row__name" onClick={() => onOpen(store.id)} aria-haspopup="dialog">
        {displayName(store.name)}
      </button>
      <p className="row__meta">
        {distance ? <span className="num">{distance}</span> : null}
        {distance ? ", " : ""}
        {store.category}
      </p>
      <RowTags store={store} onEvidence={onEvidence} />
      <MerLink merUrl={store.merUrl} className="cta row__cta" />
    </li>
  );
}

function EvidenceSheet({ evidence, stores, scopeLabel, onClose, onReceipt }: { evidence: Evidence; stores: Store[]; scopeLabel: string; onClose: () => void; onReceipt: () => void }) {
  const { store, kind } = evidence;
  return (
    <Sheet kicker={kind === "mine" ? "내가 남긴 방문 기록" : evidenceLabel(store, kind)} title={displayName(store.name)} onClose={onClose}>
      <div className="evs">
        {kind === "mine" ? <StoreSignalDetail store={store} /> : <EvidenceChart store={store} kind={kind} stores={stores} scopeLabel={scopeLabel} />}
        <MerLink merUrl={store.merUrl} className="cta evs__cta" />
        <button type="button" className="btn btn--quiet evs__receipt" onClick={onReceipt}>
          결제 영수증 보기
        </button>
      </div>
    </Sheet>
  );
}

function SearchResults({
  search,
  scope,
  exclude,
  origin,
  onPick,
  onShowChains,
  selectedId,
}: {
  search: SearchState;
  scope: HomeScope;
  exclude: boolean;
  origin: Origin;
  onPick: (s: Store) => void;
  onShowChains: () => void;
  selectedId: string | null;
}) {
  const clear = homeHref(scope, { excludeFranchise: exclude });
  const [more, setMore] = useState(SEARCH_PAGE);
  const filtered = exclude ? search.stores.filter((s) => !s.franchise) : search.stores;
  const hidden = search.stores.length - filtered.length;
  // 지점이 여럿이면 지금 거리 기준에서 가까운 순으로 보여 준다.
  const shown = origin
    ? filtered
        .map((s, i) => ({ s, i, d: distanceM(origin.point, s) }))
        .sort((a, b) => (a.d ?? Number.POSITIVE_INFINITY) - (b.d ?? Number.POSITIVE_INFINITY) || a.i - b.i)
        .map((r) => r.s)
    : filtered;
  return (
    <section className="found" aria-labelledby="found-h">
      <div className="found__head">
        <h2 id="found-h" className="found__h">
          {search.status === "error" ? `${search.query} 검색 실패` : search.status === "empty" ? `${search.query} 검색 결과 없음` : `${search.query} 검색 ${shown.length}곳`}
        </h2>
        <NavLink href={clear} className="link">
          검색 지우기
        </NavLink>
      </div>
      {search.status === "error" ? (
        <p className="found__p" role="alert">
          매장 검색 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요. 지금 지역 목록은 그대로입니다.
        </p>
      ) : search.status === "empty" ? (
        <p className="found__p">이 이름의 가게를 찾지 못했습니다. 이름을 줄이거나 동 이름과 함께 검색해 보세요.</p>
      ) : (
        <>
          {hidden > 0 ? (
            <p className="found__p">
              프랜차이즈 제외가 켜져 있어 {hidden}곳을 숨겼습니다. 끄면 볼 수 있습니다.{" "}
              <button type="button" className="link link--btn" onClick={onShowChains}>
                프랜차이즈 제외 끄기
              </button>
            </p>
          ) : null}
          {shown.length > 1 ? <p className="found__p">지점이 여러 곳입니다. 가까운 순으로 보여 드립니다. 주소를 보고 고르세요.</p> : null}
          {shown.length > 0 ? (
            <ul className="found__list">
              {shown.slice(0, more).map((s) => (
                <li key={s.id}>
                  <button type="button" className="found__btn" aria-pressed={s.id === selectedId} onClick={() => onPick(s)}>
                    <span className="found__name">{displayName(s.name)}</span>
                    <span className="found__addr">{s.address}</span>
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
