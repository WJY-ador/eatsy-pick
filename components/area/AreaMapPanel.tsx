"use client";

import "./area.css";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Receipt } from "@/components/home/Receipt";
import { StoreMap } from "@/components/StoreMap";
import { distanceLabel, distanceM } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import { holdTop, topStuck } from "@/lib/top-fold";
import { setAreaMapOpen, useAreaMapOpen } from "./map-state";

type Point = { lat: number; lng: number };

/** 이름 라벨을 먼저 붙여 보는 매장 수(매출 상위 순) */
const LABEL_TOP = 5;
const MAP_H_MOBILE = 360;
const MAP_H_WIDE = 480;
/** 지도 위아래 여백(고정 머리말 아래, 화면 아래) */
const GAP = 8;

/** 고정된 머리말(상단 바, 인앱 안내) 아래 끝 */
function stickyBottom(): number {
  let bottom = 0;
  for (const el of document.querySelectorAll("header, .inapp")) {
    const pos = getComputedStyle(el).position;
    if (pos !== "sticky" && pos !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.top <= 1) bottom = Math.max(bottom, r.bottom);
  }
  return Math.round(bottom);
}

/**
 * 랭킹 바로 아래에 펼치는 지도. 랭킹 조회 결과(서버가 Store로 바꿔 넘긴 매장)만 쓰고 다시 조회하지 않는다.
 * 핀을 누르면 같은 화면에서 결제 영수증을 연다(768px 미만 하단 시트, 이상 우측 패널). 열고 닫을 때 주소와 스크롤을 바꾸지 않는다.
 * 열림 상태는 map-state 모듈에 있어 지역 변경 뒤에도 남는다.
 */
export function AreaMapPanel({ stores, center, centerName, what }: { stores: Store[]; center: Point | null; centerName: string | null; what: string }) {
  const open = useAreaMapOpen();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 지역 변경으로 열린 채 들어오면 첫 렌더부터 지도를 그리므로 화면 폭을 바로 읽는다(서버에서는 지도를 그리지 않는다).
  const [height, setHeight] = useState(() => (typeof window !== "undefined" && window.matchMedia("(min-width: 48rem)").matches ? MAP_H_WIDE : MAP_H_MOBILE));
  const byId = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const placed = useMemo(() => stores.filter((s) => s.lat !== null && s.lng !== null), [stores]);
  const unplaced = stores.length - placed.length;
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const toggle = () => {
    const next = !open;
    if (next) setHeight(window.matchMedia("(min-width: 48rem)").matches ? MAP_H_WIDE : MAP_H_MOBILE);
    else setSelectedId(null);
    setAreaMapOpen(next);
    if (!next) return;
    // 펼친 지도가 고정 머리말에 가리거나 화면 아래로 잘리면, 지도 윗변이 머리말 아래에 오는 범위 안에서만 굴린다.
    window.requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      // 768px 미만은 상단 바의 지금 상태(접힘, 펼침)로 높이를 잡고, 굴리는 동안 그 상태를 묶는다.
      const top = (topStuck() ?? stickyBottom()) + GAP;
      const r = el.getBoundingClientRect();
      let dy = 0;
      if (r.top < top) dy = r.top - top;
      else if (r.bottom > window.innerHeight - GAP) dy = Math.min(r.bottom - (window.innerHeight - GAP), r.top - top);
      if (dy !== 0) {
        holdTop();
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: window.scrollY + dy, behavior: still ? "auto" : "smooth" });
      }
    });
  };

  const onPin = useCallback(
    (id: string, el?: HTMLElement) => {
      if (!byId.has(id)) return;
      trigger.current = el ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setSelectedId(id);
    },
    [byId],
  );

  const close = useCallback(() => {
    setSelectedId(null);
    // 연 핀으로 포커스를 돌려준다. 페이지는 굴리지 않는다(보던 랭킹 위치 유지).
    const t = trigger.current;
    if (t && document.contains(t)) t.focus({ preventScroll: true });
  }, []);

  return (
    <div className="amap">
      <p className="report__cta amap__cta">
        <button
          type="button"
          className="btn btn--primary amap__toggle"
          data-testid="area-map-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          {open ? "지도 접기" : "이 상권 지도에서 고르기"}
        </button>
      </p>
      <div id={panelId} ref={panelRef} className="amap__panel" hidden={!open} data-testid={open ? "area-map" : undefined} data-placed={placed.length} data-unplaced={unplaced}>
        {open ? (
          <>
            <p className="amap__note">
              {what} <span className="num">{stores.length}</span>곳 중 <span className="num">{placed.length}</span>곳을 지도에 표시합니다.
              {unplaced > 0 ? (
                <>
                  {" "}
                  좌표가 없는 <span className="num">{unplaced}</span>곳은 지도에서 빠졌습니다.
                </>
              ) : null}{" "}
              핀을 누르면 결제 영수증이 열립니다.
            </p>
            {placed.length > 0 ? (
              <StoreMap stores={placed} selectedId={selectedId} onSelect={onPin} me={null} height={height} focus={null} labelTop={LABEL_TOP} />
            ) : (
              <p className="report__empty">지도에 표시할 좌표가 있는 매장이 없습니다.</p>
            )}
          </>
        ) : null}
      </div>
      {selected ? (
        <Receipt
          store={selected}
          distance={center ? distanceLabel(distanceM(center, selected)) : null}
          distanceBasis={center && centerName ? `${centerName} 기준` : null}
          onClose={close}
          live
        />
      ) : null}
    </div>
  );
}
