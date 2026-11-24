"use client";

import "@/app/storemap.css";
import dynamic from "next/dynamic";
import { type JSX, type ReactNode, type RefObject, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { MapView } from "@/lib/area-search";
import { MAP_PROVIDER } from "@/lib/map-provider";
import type { Store } from "@/lib/stores";

type Point = { lat: number; lng: number };

export type StoreMapProps = {
  stores: Store[];
  selectedId: string | null;
  /** 핀을 누르면 부른다. el은 누른 핀(영수증을 닫은 뒤 포커스를 돌려줄 자리) */
  onSelect: (id: string, el?: HTMLElement) => void;
  me: Point | null;
  height?: number;
  /** 내 주변 모드. true일 때만 내 위치를 지도 범위 계산에 넣는다(기본 false). */
  near?: boolean;
  /** 내 위치 버튼 상태. */
  locateState?: "idle" | "locating" | "on" | "denied";
  /** 있으면 지도가 내 위치 버튼을 그린다. 누르면 항상 호출한다. */
  onLocate?: () => void;
  /** 있으면 첫 화면을 이 점 주변(역, 출구, 골목이 읽히는 축척)으로 잡는다. 없으면 매장 범위 */
  focus?: Point | null;
  /** 목록에서 강조한 매장. 핀과 이름을 강조한다(묶여 있으면 그 묶음을 강조한다) */
  hoverId?: string | null;
  /** 축척과 관계없이 이름을 붙여 보는 우선 매장 수(매출 상위 순). 기본 0 */
  labelTop?: number;
  /**
   * 사용자 상태에서 보이는 범위가 바뀌면 그 범위와 사용자 제스처(끌기, 휠, 두 손가락, 확대와 축소 버튼)로 시작된 이동인지를,
   * 자동 맞춤(첫 화면, 상권 전체 보기)으로 돌아가면 null을 받는다. 홈 지도만 넘긴다
   */
  onUserView?: (v: MapView | null, byGesture: boolean) => void;
  /** 지도 위에 더 그릴 요소(홈의 현 지도에서 검색). 지도 틀 안, 조작 버튼과 같은 층 */
  overlay?: ReactNode;
  /**
   * 768px 미만 터치 기기에서 한 손가락 끌기를 지도 대신 페이지 스크롤로 넘기고 두 손가락 안내를 잠깐 띄운다(기본 false).
   * 두 손가락이면 지도를 옮기고 확대, 축소한다. 핀 누름과 확대, 축소 버튼은 그대로 된다.
   */
  touchLock?: boolean;
};

/** 지도 위 버튼이 어댑터에 시키는 일. 어댑터가 지도를 만든 뒤 채운다 */
export type MapApi = {
  zoomIn(): void;
  zoomOut(): void;
  /** 상권 전체 보기: 모든 핀(near일 때만 내 위치 포함) 범위로 맞춘다 */
  fit(): void;
  /** 내 위치가 있으면 그 자리를 가운데로. 없으면 아무것도 안 한다 */
  centerMe(): void;
  /** 터치 잠금 중 두 손가락이 닿으면 true, 손을 모두 떼면 false. 잠금이 아니면 늘 끌 수 있다 */
  setTouchDrag(on: boolean): void;
};

/**
 * 어댑터가 받는 props. 버튼은 StoreMap이 그리고, 어댑터는 지도, 핀, 묶음만 맡는다.
 * 보기 상태는 어댑터 안에서 하나로 관리한다: home(첫 화면 규칙), all(상권 전체 보기), user(사용자가 움직인 뒤에는 그대로 둔다).
 */
export type MapAdapterProps = Pick<StoreMapProps, "stores" | "selectedId" | "onSelect" | "me" | "onUserView"> & {
  near: boolean;
  focus: Point | null;
  hoverId: string | null;
  labelTop: number;
  apiRef: RefObject<MapApi | null>;
  /** true면 한 손가락 끌기로 지도를 옮기지 않는다. 두 손가락일 때만 StoreMap이 apiRef.setTouchDrag(true)로 잠깐 푼다 */
  locked: boolean;
};

const DEFAULT_MAP_HEIGHT = 360;
/** 터치 잠금을 거는 환경: 768px 미만이고 주 입력이 터치 */
const TOUCH_LOCK_QUERY = "(max-width: 767.98px) and (pointer: coarse)";
/** 한 손가락이 이만큼(px) 움직이면 두 손가락 안내를 띄운다. 핀 탭은 띄우지 않는다 */
const HINT_SLOP = 10;
/** 손을 멈춘 뒤 안내가 남는 시간 */
const HINT_MS = 1500;

function subscribeTouchLock(cb: () => void): () => void {
  const mq = window.matchMedia(TOUCH_LOCK_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const touchLockNow = () => window.matchMedia(TOUCH_LOCK_QUERY).matches;
// 서버와 첫 수화에서는 잠그지 않는다. 수화 뒤 환경을 읽는다.
const touchLockServer = () => false;
const LOCK_EVENTS = ["touchstart", "touchmove", "touchend", "touchcancel", "pointerdown", "pointermove", "pointerup", "pointercancel"] as const;

// Leaflet은 브라우저에서만 돈다. 코드, CSS, 타일은 지도가 처음 그려질 때 불러온다.
const Inner = dynamic(() => import("./StoreMapLeaflet"), {
  ssr: false,
  loading: () => <div className="storemap__frame storemap__frame--loading" aria-hidden="true" />,
});
// 카카오 키가 있는 빌드에서만 쓴다. SDK 로드나 인증이 실패하면 Leaflet으로 넘어간다.
const Kakao = dynamic(() => import("./StoreMapKakao"), {
  ssr: false,
  loading: () => <div className="storemap__frame storemap__frame--loading" aria-hidden="true" />,
});

const LOCATE_NOTE: Record<NonNullable<StoreMapProps["locateState"]>, string> = {
  idle: "누르면 내 위치를 찾습니다",
  locating: "내 위치를 찾는 중",
  on: "내 위치 사용 중",
  denied: "위치를 받지 못했습니다. 누르면 다시 찾습니다",
};

function LocateIcon(): JSX.Element {
  return (
    <svg className="storemap__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle className="storemap__icon-core" cx="12" cy="12" r="2.6" fill="currentColor" />
      <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 매장 지도. 핀을 누르면 onSelect(id, el)만 부른다. 지도 이동, 확대, 묶음 풀기는 서버를 다시 부르지 않는다.
 * 지도 위 조작 요소(상권 전체 보기, 확대와 축소, 내 위치)는 여기서 그리고, 지도 동작은 어댑터에 맡긴다.
 */
export function StoreMap({
  stores,
  selectedId,
  onSelect,
  me,
  height = DEFAULT_MAP_HEIGHT,
  near = false,
  locateState = "idle",
  onLocate,
  focus = null,
  hoverId = null,
  labelTop = 0,
  onUserView,
  overlay = null,
  touchLock = false,
}: StoreMapProps): JSX.Element {
  const [kakaoFailed, setKakaoFailed] = useState(false);
  const useKakao = MAP_PROVIDER === "kakao" && !kakaoFailed;
  const apiRef = useRef<MapApi | null>(null);
  const noteId = useId();
  const touchEnv = useSyncExternalStore(subscribeTouchLock, touchLockNow, touchLockServer);
  const locked = touchLock && touchEnv;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(false);

  // 터치 잠금(구글 지도 웹의 두 손가락 조작과 같은 방식). 손가락 수로 나눈다.
  // 한 손가락: 캡처 단계에서 지도 쪽 전파를 끊는다. 기본 동작(페이지 스크롤)은 그대로 두고, 움직이면 안내를 띄운다.
  //   모바일 UA의 카카오 지도는 setDraggable(false)와 touch-action을 바꿔도 터치를 취소해 페이지가 멈춘다(2026-11-24 측정).
  //   탭에서 나오는 click은 막지 않으므로 핀과 버튼은 그대로 눌린다.
  // 두 손가락: 전파를 끊지 않고 끌기를 잠깐 풀어 지도가 이동과 확대, 축소를 받는다. 손을 모두 떼면 다시 잠근다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!locked || !wrap) return;
    const ids = new Set<number>();
    let two = false;
    let start: { x: number; y: number } | null = null;
    let timer = 0;
    const enterTwo = () => {
      if (two) return;
      two = true;
      setHint(false);
      apiRef.current?.setTouchDrag(true);
    };
    const leaveTwo = () => {
      ids.clear();
      start = null;
      if (!two) return;
      two = false;
      apiRef.current?.setTouchDrag(false);
    };
    const showHint = () => {
      setHint(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHint(false), HINT_MS);
    };
    const onEvent = (e: Event) => {
      if (e instanceof PointerEvent) {
        if (e.pointerType !== "touch") return;
        if (e.type === "pointerdown") {
          ids.add(e.pointerId);
          if (ids.size >= 2) enterTwo();
        }
        const pass = two;
        if (e.type === "pointerup" || e.type === "pointercancel") ids.delete(e.pointerId);
        if (!pass) e.stopPropagation();
        return;
      }
      const t = e as TouchEvent;
      const p = t.touches[0];
      if (t.type === "touchstart") {
        if (t.touches.length >= 2) enterTwo();
        else if (p) start = { x: p.clientX, y: p.clientY };
      }
      const pass = two;
      if ((t.type === "touchend" || t.type === "touchcancel") && t.touches.length === 0) leaveTwo();
      if (pass) return;
      e.stopPropagation();
      if (t.type === "touchmove" && t.touches.length === 1 && p && start && Math.hypot(p.clientX - start.x, p.clientY - start.y) > HINT_SLOP) showHint();
    };
    for (const t of LOCK_EVENTS) wrap.addEventListener(t, onEvent, { capture: true, passive: true });
    return () => {
      for (const t of LOCK_EVENTS) wrap.removeEventListener(t, onEvent, { capture: true });
      window.clearTimeout(timer);
      setHint(false);
      if (two) apiRef.current?.setTouchDrag(false);
    };
  }, [locked]);

  const adapter: MapAdapterProps = { stores, selectedId, onSelect, me, near, focus, hoverId, labelTop, apiRef, locked, onUserView };
  return (
    <div className="storemap" style={{ "--storemap-h": `${height}px` } as React.CSSProperties}>
      <div ref={wrapRef} className="storemap__wrap" data-touch-lock={locked ? "" : undefined}>
        {useKakao ? <Kakao {...adapter} onFail={() => setKakaoFailed(true)} /> : <Inner {...adapter} />}
        {locked ? (
          <div className="storemap__hint" data-testid="map-hint" data-show={hint ? "" : undefined} aria-hidden="true">
            <span>두 손가락으로 지도를 움직이세요</span>
          </div>
        ) : null}
        <button
          type="button"
          className="storemap__fit"
          data-map-ctl=""
          onClick={() => {
            apiRef.current?.fit();
            onUserView?.(null, false);
          }}
        >
          상권 전체 보기
        </button>
        {overlay}
        <div className="storemap__side">
          <div className="storemap__zoom" role="group" aria-label="지도 확대와 축소" data-map-ctl="">
            <button type="button" className="storemap__btn" aria-label="확대" onClick={() => apiRef.current?.zoomIn()}>
              <span aria-hidden="true">+</span>
            </button>
            <button type="button" className="storemap__btn" aria-label="축소" onClick={() => apiRef.current?.zoomOut()}>
              <span aria-hidden="true">−</span>
            </button>
          </div>
          {onLocate ? (
            <button
              type="button"
              className="storemap__btn storemap__locate"
              data-map-ctl=""
              data-state={locateState}
              aria-label="내 위치"
              aria-pressed={locateState === "on"}
              aria-busy={locateState === "locating"}
              aria-describedby={noteId}
              title={LOCATE_NOTE[locateState]}
              onClick={() => {
                apiRef.current?.centerMe();
                onLocate();
              }}
            >
              <LocateIcon />
              <span id={noteId} className="storemap__sr">
                {LOCATE_NOTE[locateState]}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
