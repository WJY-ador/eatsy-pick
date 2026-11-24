"use client";

import "@/app/mapsection.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { StoreMap } from "@/components/StoreMap";
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
};

/** 우선 이름 라벨을 붙여 보는 매장 수(매출 상위 순). 겹치면 끈다 */
const LABEL_TOP = 5;
/** 768px 미만에서 목록을 처음에 보여 주는 수. 더 보기로 늘린다 */
const MOBILE_PAGE = 10;
const MAP_H = 320;

type Row = { s: Store; d: number | null; i: number };

/** 매출 상위 순 비교: ccgRank 오름차순, 값이 없으면 뒤, 같으면 입력 순서 */
function byRank(a: Row, b: Row): number {
  const ra = typeof a.s.ccgRank === "number" && Number.isFinite(a.s.ccgRank) ? a.s.ccgRank : Number.POSITIVE_INFINITY;
  const rb = typeof b.s.ccgRank === "number" && Number.isFinite(b.s.ccgRank) ? b.s.ccgRank : Number.POSITIVE_INFINITY;
  return ra === rb ? a.i - b.i : ra - rb;
}

/** 고정된 머리말(상단 바, 인앱 안내) 아래 끝. 지도 크게 보기의 높이와 스크롤 위치에 쓴다 */
function stickyBottom(): number {
  let bottom = 0;
  for (const el of document.querySelectorAll("header, .inapp")) {
    const style = getComputedStyle(el);
    if (style.position !== "sticky" && style.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    const top = Number.parseFloat(style.top) || 0;
    if (r.top <= top + 1) bottom = Math.max(bottom, r.bottom);
  }
  return Math.round(bottom);
}

/**
 * 지도와 전체 매장. 768px 이상은 왼쪽 목록 40%, 오른쪽 지도 60%. 768px 미만은 지도 아래 세로 목록이고, 지도 크게 보기로 넓힌다.
 * 지도 인스턴스는 하나다. 지도 크게 보기는 data-expanded와 CSS만 바꾸므로 조건, 선택, 지도 위치가 그대로 남는다.
 * 지도 이동, 확대, 묶음 풀기, 정렬은 서버를 부르지 않는다(정렬 주소 반영은 onSort를 받은 쪽이 history로 한다).
 */
export function MapSection({ stores, origin, originLabel, focus, me, near, locateState, onLocate, selectedId, onOpen, sort, onSort }: MapSectionProps) {
  const headId = useId();
  const listId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(MOBILE_PAGE);
  // 영수증을 닫아도 마지막으로 연 매장을 지도와 목록에서 계속 표시한다(지도 크게 보기와 피드를 오가도 유지).
  const [picked, setPicked] = useState<string | null>(selectedId);
  if (selectedId !== null && selectedId !== picked) setPicked(selectedId);

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

  const toggleExpand = () => {
    const next = !expanded;
    const sec = sectionRef.current;
    if (sec) {
      const top = stickyBottom();
      sec.style.setProperty("--mapsec-top", `${top}px`);
      setExpanded(next);
      // 넓히면 섹션 머리를 고정 머리말 바로 아래로 올린다. 접으면 섹션 머리가 보이는 자리에 둔다.
      window.requestAnimationFrame(() => {
        const r = sec.getBoundingClientRect();
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (next || r.top < top) window.scrollTo({ top: window.scrollY + r.top - top, behavior: still ? "auto" : "smooth" });
      });
      return;
    }
    setExpanded(next);
  };

  const count = rows.length;
  const sortLine = sort === "rank" ? "매출 상위 순" : origin ? `${originLabel}에서 가까운 순` : "가까운 순, 거리 기준점 없음";
  const hiddenRows = expanded ? 0 : Math.max(0, count - limit);

  return (
    <section ref={sectionRef} className="mapsec" data-testid="map-section" data-expanded={expanded ? "true" : undefined} aria-labelledby={headId}>
      <div className="mapsec__head">
        <div className="mapsec__titles">
          <h2 id={headId} className="mapsec__title">
            지도와 전체 매장
          </h2>
          <p className="mapsec__sub">
            <span className="num">{count}</span>곳, {sortLine}
            {unplacedCount > 0 ? (
              <>
                . 지도에 표시한 매장 <span className="num">{count - unplacedCount}</span>곳, 좌표가 없는 <span className="num">{unplacedCount}</span>곳은 목록 끝에 둡니다
              </>
            ) : null}
          </p>
        </div>
        <div className="mapsec__tools">
          <div className="mapsec__sort" role="group" aria-label="목록 정렬">
            <button type="button" className="mapsec__chip" data-testid="sort-near" aria-pressed={sort === "near"} onClick={() => sort !== "near" && onSort("near")}>
              가까운 순
            </button>
            <button type="button" className="mapsec__chip" data-testid="sort-rank" aria-pressed={sort === "rank"} onClick={() => sort !== "rank" && onSort("rank")}>
              매출 상위 순
            </button>
          </div>
          <button type="button" className="mapsec__expand" data-testid="map-expand" aria-expanded={expanded} aria-controls={listId} onClick={toggleExpand}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              {expanded ? (
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            {expanded ? "피드로 돌아가기" : "지도 크게 보기"}
          </button>
        </div>
      </div>

      {count === 0 ? (
        <p className="mapsec__empty" role="status">
          지금 조건에 맞는 매장이 없습니다.
        </p>
      ) : (
        <div className="mapsec__body" id={listId}>
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
            />
          </div>
          <div className="mapsec__side">
            <ol ref={listRef} className="mapsec__list" aria-label="전체 매장 목록">
              {rows.map((r, k) => (
                <li key={r.s.id} className={k >= limit ? "mapsec__row is-more" : "mapsec__row"} data-row={r.s.id}>
                  <StoreCard store={r.s} distanceM={r.d} onOpen={onOpen} variant="row" active={r.s.id === pickedShown || r.s.id === hoverId} onHover={setHoverId} />
                </li>
              ))}
            </ol>
            {hiddenRows > 0 ? (
              <button type="button" className="mapsec__more" onClick={() => setLimit((v) => v + MOBILE_PAGE)}>
                매장 더 보기 (<span className="num">{hiddenRows}</span>곳 남음)
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
