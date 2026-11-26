"use client";

import "@/app/mapsection.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { StoreMap } from "@/components/StoreMap";
import { AREA_SEARCH_MAX_KM, type MapView, type PanStore } from "@/lib/area-search";
import { distanceM } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import { StoreCard } from "./StoreCard";

type Point = { lat: number; lng: number };

export type MapSectionProps = {
  /** 지역, 프랜차이즈, 테마를 적용한 뒤의 후보(큐레이션과 같은 집합) */
  stores: Store[];
  /** 거리 기준점(내 위치, 장소, 프리셋 중심, 없으면 null) */
  origin: Point | null;
  /** 예: "내 위치", "해운대역", "강남역 중심" */
  originLabel: string;
  /** 있으면 첫 화면 줌을 이 점 주변으로 잡는다. 없으면 매장 범위 */
  focus: Point | null;
  me: Point | null;
  near: boolean;
  locateState: "idle" | "locating" | "on" | "denied";
  onLocate: () => void;
  /** 영수증이 열린 매장 */
  selectedId: string | null;
  /** 핀이나 목록을 누르면 영수증을 바로 연다 */
  onOpen: (store: Store, trigger: HTMLElement | null) => void;
  sort: "near" | "rank";
  onSort: (s: "near" | "rank") => void;
  /**
   * 있으면 지도에 현 지도에서 검색 버튼을 띄운다(사용자가 지도를 움직인 뒤, 보이는 가로 폭이 AREA_SEARCH_MAX_KM 이하일 때만).
   * 누르면 그때의 지도 범위를 넘긴다. 이동했으면 null, 못 갔으면 지도 위에 띄울 짧은 안내를 돌려준다
   */
  onAreaSearch?: (v: MapView) => Promise<string | null>;
  /**
   * 있으면 사용자 제스처 이동이 끝날 때마다 그 범위를, 자동 맞춤(첫 화면, 상권 전체 보기)으로 돌아가면 null을 넘긴다.
   * 받는 쪽이 옮긴 동네 핀을 조회한다(lib/area-search.ts)
   */
  onPanView?: (v: MapView | null) => void;
  /** 옮긴 동네 핀(지도에만 옅게, 목록에는 넣지 않는다) */
  panStores?: PanStore[];
  /** 옮긴 동네 핀을 누르면 그 매장 id로 부른다 */
  onPanPick?: (id: string) => void;
};

/** 우선 이름 라벨을 붙여 보는 매장 수(매출 상위 순). 겹치면 끈다 */
const LABEL_TOP = 5;
const MAP_H = 320;

type Row = { s: Store; d: number | null; i: number };

/** 매출 상위 순 비교: ccgRank 오름차순, 값이 없으면 뒤, 같으면 입력 순서 */
function byRank(a: Row, b: Row): number {
  const ra = typeof a.s.ccgRank === "number" && Number.isFinite(a.s.ccgRank) ? a.s.ccgRank : Number.POSITIVE_INFINITY;
  const rb = typeof b.s.ccgRank === "number" && Number.isFinite(b.s.ccgRank) ? b.s.ccgRank : Number.POSITIVE_INFINITY;
  return ra === rb ? a.i - b.i : ra - rb;
}

/**
 * 지도와 전체 매장. 768px 이상은 왼쪽 목록 40%, 오른쪽 지도 60%.
 * 768px 미만은 섹션이 접힌 상단 바 아래 화면 높이를 채우고 위가 지도(높이 상한이 있다), 남은 아래가 목록이다(목록만 따로 스크롤한다. app/mapsection.css).
 * 홈에서는 칩 바로 아래에 있어 390px 첫 화면에 지도와 첫 목록 행이 함께 보이게 지도 높이를 정한다.
 * 확대, 묶음 풀기, 정렬은 서버를 부르지 않는다(정렬 주소 반영은 onSort를 받은 쪽이 history로 한다).
 * 지도 이동은 onPanView를 받은 쪽이 조건에 맞을 때만 옮긴 동네 핀을 조회한다(lib/area-search.ts).
 */
export function MapSection({ stores, origin, originLabel, focus, me, near, locateState, onLocate, selectedId, onOpen, sort, onSort, onAreaSearch, onPanView, panStores, onPanPick }: MapSectionProps) {
  const headId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // 영수증을 닫아도 마지막으로 연 매장을 지도와 목록에서 계속 표시한다.
  const [picked, setPicked] = useState<string | null>(selectedId);
  if (selectedId !== null && selectedId !== picked) setPicked(selectedId);

  // 현 지도에서 검색: 사용자가 움직인 지도 범위(자동 맞춤이면 null), 조회 중 여부, 지도 위 안내 한 줄.
  // 매장 집합이나 기준점이 바뀌면(지역 이동) 지도가 첫 화면 규칙으로 돌아가므로 버튼과 안내를 지운다.
  const [view, setView] = useState<MapView | null>(null);
  const [searching, setSearching] = useState(false);
  const [areaNote, setAreaNote] = useState<string | null>(null);
  const viewKey = `${stores.map((st) => st.id).join(",")}|${focus ? `${focus.lat},${focus.lng}` : ""}`;
  const [seenViewKey, setSeenViewKey] = useState(viewKey);
  if (seenViewKey !== viewKey) {
    setSeenViewKey(viewKey);
    setView(null);
    setAreaNote(null);
  }
  // 제스처로 시작된 이동만 버튼을 새로 띄운다. 제스처가 아닌 이동(목록 선택의 panTo)은 이미 떠 있는 버튼의 범위만 고친다.
  const onUserView = useCallback(
    (v: MapView | null, byGesture: boolean) => {
      if (v === null || byGesture) {
        setView(v);
        setAreaNote(null);
        onPanView?.(v);
        return;
      }
      setView((prev) => (prev ? v : prev));
    },
    [onPanView],
  );
  const searchHere = async () => {
    if (!onAreaSearch || !view || searching) return;
    setSearching(true);
    try {
      // 이동했거나 안내를 띄우면 버튼을 내린다. 다시 움직이면 다시 뜬다.
      const note = await onAreaSearch(view);
      setView(null);
      setAreaNote(note);
    } finally {
      setSearching(false);
    }
  };
  const hereShown = !!onAreaSearch && view !== null && view.widthKm <= AREA_SEARCH_MAX_KM;
  const hereOverlay =
    onAreaSearch && (hereShown || areaNote) ? (
      <div className="mapsec__here" data-testid="map-search-here">
        {hereShown ? (
          <button type="button" className="mapsec__here-btn" data-map-ctl="" disabled={searching} aria-busy={searching} onClick={() => void searchHere()}>
            {searching ? "지역 찾는 중" : "현 지도에서 검색"}
          </button>
        ) : null}
        {areaNote ? (
          <p className="mapsec__here-note" role="status">
            {areaNote}
          </p>
        ) : null}
      </div>
    ) : null;

  const rows = useMemo(() => {
    const all: Row[] = stores.map((s, i) => ({ s, i, d: origin ? distanceM(origin, s) : null }));
    // 좌표가 없는 매장은 거리를 알 수 없고 지도에 없다. 어느 정렬이든 목록 끝에 둔다.
    const placed = all.filter((r) => r.s.lat !== null && r.s.lng !== null);
    const unplaced = all.filter((r) => r.s.lat === null || r.s.lng === null);
    if (sort === "rank") return [...placed.sort(byRank), ...unplaced.sort(byRank)];
    return [...placed.sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d || a.i - b.i : a.i - b.i)), ...unplaced];
  }, [stores, origin, sort]);
  const unplacedCount = rows.filter((r) => r.s.lat === null || r.s.lng === null).length;
  const byId = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const pickedShown = picked !== null && byId.has(picked) ? picked : null;

  const onPin = useCallback(
    (id: string, el?: HTMLElement) => {
      const s = byId.get(id);
      if (s) onOpen(s, el ?? null);
    },
    [byId, onOpen],
  );

  // 지도에서 고른 매장이 목록 안쪽 스크롤 밖이면 그 행이 보이게 목록만 굴린다(페이지는 움직이지 않는다).
  useEffect(() => {
    const list = listRef.current;
    if (!list || !pickedShown || list.scrollHeight <= list.clientHeight) return;
    const row = list.querySelector<HTMLElement>(`[data-row="${CSS.escape(pickedShown)}"]`);
    if (!row) return;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight;
  }, [pickedShown]);

  const count = rows.length;

  return (
    <section className="mapsec" data-testid="map-section" aria-labelledby={headId}>
      <div className="mapsec__head">
        <div className="mapsec__titles">
          <h2 id={headId} className="mapsec__title">
            지도와 전체 매장
          </h2>
          <p className="mapsec__sub">
            전체 <span className="num">{count}</span>곳
            {unplacedCount > 0 ? (
              <>
                , 지도 <span className="num">{count - unplacedCount}</span>곳
              </>
            ) : null}
          </p>
        </div>
        <div className="mapsec__tools">
          <div className="mapsec__sort" role="group" aria-label="목록 정렬">
            <button type="button" className="mapsec__chip" data-testid="sort-near" aria-pressed={sort === "near"} title={origin ? originLabel : undefined} onClick={() => sort !== "near" && onSort("near")}>
              가까운 순
            </button>
            <button type="button" className="mapsec__chip" data-testid="sort-rank" aria-pressed={sort === "rank"} onClick={() => sort !== "rank" && onSort("rank")}>
              매출 상위 순
            </button>
          </div>
        </div>
      </div>

      {count === 0 ? (
        <p className="mapsec__empty" role="status">
          지금 조건에 맞는 매장이 없습니다.
        </p>
      ) : (
        <div className="mapsec__body">
          <div className="mapsec__map">
            <StoreMap
              stores={stores}
              selectedId={pickedShown}
              onSelect={onPin}
              me={me}
              height={MAP_H}
              near={near}
              locateState={locateState}
              onLocate={onLocate}
              focus={focus}
              hoverId={hoverId}
              labelTop={LABEL_TOP}
              onUserView={onAreaSearch || onPanView ? onUserView : undefined}
              overlay={hereOverlay}
              touchAxis
              panStores={panStores}
              onPanPick={onPanPick}
            />
          </div>
          <div className="mapsec__side">
            <ol ref={listRef} className="mapsec__list" aria-label="전체 매장 목록">
              {rows.map((r) => (
                <li key={r.s.id} className="mapsec__row" data-row={r.s.id}>
                  <StoreCard store={r.s} distanceM={r.d} onOpen={onOpen} variant="row" active={r.s.id === pickedShown || r.s.id === hoverId} onHover={setHoverId} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
