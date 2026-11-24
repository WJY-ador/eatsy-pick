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
   * 768px 미만 터치 기기에서 한 손가락 터치를 처음 움직인 방향으로 나눈다(기본 false).
   * 가로가 크면 지도를 옮기고, 세로가 크면 지도는 그대로 두고 페이지를 스크롤한다. 확대, 축소는 두 손가락이나 버튼으로 한다.
   * 핀 누름과 지도 위 버튼은 그대로 된다. false면 한 손가락 끌기를 지도가 모두 받는다.
   */
  touchAxis?: boolean;
};

/** 지도 위 버튼이 어댑터에 시키는 일. 어댑터가 지도를 만든 뒤 채운다 */
export type MapApi = {
  zoomIn(): void;
  zoomOut(): void;
  /** 상권 전체 보기: 모든 핀(near일 때만 내 위치 포함) 범위로 맞춘다 */
  fit(): void;
  /** 내 위치가 있으면 그 자리를 가운데로. 없으면 아무것도 안 한다 */
  centerMe(): void;
  /** 한 손가락 가로 끌기가 시작될 때 StoreMap이 부른다(touchAxis). 사용자 상태로 두고 제스처 시각을 찍는다 */
  touchPan(): void;
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
};

const DEFAULT_MAP_HEIGHT = 360;
/** 한 손가락 방향 나눔을 거는 환경: 768px 미만이고 주 입력이 터치 */
const TOUCH_AXIS_QUERY = "(max-width: 767.98px) and (pointer: coarse)";
/**
 * 한 손가락이 이만큼(px) 넘게 움직이면 방향을 정한다. 그 전에 떼면 탭이다.
 * 브라우저가 스크롤을 시작하는 거리보다 작아야 가로로 정한 move를 preventDefault해 스크롤을 막을 수 있다.
 */
const AXIS_SLOP = 6;

function subscribeTouchAxis(cb: () => void): () => void {
  const mq = window.matchMedia(TOUCH_AXIS_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const touchAxisNow = () => window.matchMedia(TOUCH_AXIS_QUERY).matches;
// 서버와 첫 수화에서는 나누지 않는다. 수화 뒤 환경을 읽는다.
const touchAxisServer = () => false;
const TOUCH_EVENTS = ["touchstart", "touchmove", "touchend", "touchcancel"] as const;
const POINTER_EVENTS = ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const;
/** 한 손가락 제스처의 단계. wait: 방향 판정 전, map: 가로(지도가 받음), page: 세로(페이지가 받음), two: 두 손가락 이상 */
type Phase = "idle" | "wait" | "map" | "page" | "two";

/** 터치가 지도 틀(타일, 핀, 묶음) 안에서 시작했는지. 지도 위 버튼은 틀 밖의 형제다 */
function inFrame(e: Event): boolean {
  return e.target instanceof Element && e.target.closest(".storemap__frame") !== null;
}

/** 지도 루트에 넣을 합성 터치 한 점. at을 주면 그 화면 좌표로 옮긴다 */
function touchAt(t: Touch, target: Element, at?: { x: number; y: number }) {
  const x = at?.x ?? t.clientX;
  const y = at?.y ?? t.clientY;
  return {
    identifier: t.identifier,
    target,
    clientX: x,
    clientY: y,
    pageX: x + window.scrollX,
    pageY: y + window.scrollY,
    screenX: t.screenX - (t.clientX - x),
    screenY: t.screenY - (t.clientY - y),
    radiusX: t.radiusX,
    radiusY: t.radiusY,
    rotationAngle: t.rotationAngle,
    force: t.force,
  };
}

/**
 * 지도 루트에 합성 touchstart를 넣는다. Touch 생성자가 없는 브라우저(iOS Safari)에서도 같은 경로로 돌게 일반 Event에 touches를 붙인다.
 * 핀과 묶음 버튼은 touchstart 전파를 끊으므로(카카오 CustomOverlay clickable, Leaflet disableClickPropagation) 그 위에서 시작한 터치도 루트로 넣는다.
 */
function fireTouchStart(root: Element, touches: ReturnType<typeof touchAt>[], changed: ReturnType<typeof touchAt>[]): void {
  const ev = new Event("touchstart", { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(ev, "touches", { value: touches });
  Object.defineProperty(ev, "targetTouches", { value: touches });
  Object.defineProperty(ev, "changedTouches", { value: changed });
  root.dispatchEvent(ev);
}

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
  touchAxis = false,
}: StoreMapProps): JSX.Element {
  const [kakaoFailed, setKakaoFailed] = useState(false);
  const useKakao = MAP_PROVIDER === "kakao" && !kakaoFailed;
  const apiRef = useRef<MapApi | null>(null);
  const noteId = useId();
  const touchEnv = useSyncExternalStore(subscribeTouchAxis, touchAxisNow, touchAxisServer);
  const axis = touchAxis && touchEnv;
  const wrapRef = useRef<HTMLDivElement>(null);

  // 한 손가락 방향 나눔. 캡처 단계에서 지도 틀 안에서 시작한 터치를 먼저 받는다.
  // 한 손가락: 지도 라이브러리에 넘기지 않고 AXIS_SLOP까지 기다렸다가 방향을 정한다.
  //   가로가 크면 그 move를 preventDefault해 페이지 스크롤을 막고, 처음 닿은 자리의 합성 touchstart를 지도 루트(틀의 첫 자식)에 넣은 뒤
  //   그 move부터 넘긴다. 끌기와 관성은 라이브러리가 맡는다.
  //   세로가 크거나 브라우저가 이미 스크롤을 잡았으면(move의 cancelable이 false) 손을 뗄 때까지 넘기지 않는다. 틀의 touch-action: pan-y로 페이지가 스크롤된다.
  //   움직이기 전에 떼면 탭이다. 탭에서 나오는 click은 막지 않으므로 핀과 묶음은 그대로 눌린다.
  //   카카오는 touchmove마다 preventDefault를 부르므로(touchstart에는 부르지 않는다) 판정 전에 넘기면 페이지가 멈춘다(2026-11-24 측정).
  // 두 손가락: 넘긴다. 라이브러리가 이동과 확대, 축소를 받는다. 핀이나 묶음 위에 닿은 touchstart는 지도 루트로 다시 넣는다.
  //   세로 스크롤 중에 닿은 두 번째 손가락은 넘기지 않는다.
  // 포인터 이벤트(터치)는 지도로 넘기는 단계에서만 통과시킨다. 휴대폰의 두 라이브러리는 터치 이벤트로 끌고 확대한다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!axis || !wrap) return;
    let phase: Phase = "idle";
    let start: { x: number; y: number } | null = null;
    const passing = () => phase === "map" || phase === "two";
    const mapRoot = () => (apiRef.current ? (wrap.querySelector(".storemap__frame")?.firstElementChild ?? null) : null);
    const startMapDrag = (t: Touch): boolean => {
      const root = mapRoot();
      if (!root || !start || !apiRef.current) return false;
      apiRef.current.touchPan();
      const first = touchAt(t, root, start);
      fireTouchStart(root, [first], [first]);
      return true;
    };
    /** 핀이나 묶음 위에 닿은 두 손가락 touchstart를 지도 루트로 옮긴다. 옮겼으면 true */
    const redirectTwo = (e: TouchEvent): boolean => {
      const root = mapRoot();
      if (!root || !(e.target instanceof Element) || !e.target.closest(".smpin, .smclu")) return false;
      fireTouchStart(
        root,
        Array.from(e.touches, (t) => touchAt(t, root)),
        Array.from(e.changedTouches, (t) => touchAt(t, root)),
      );
      return true;
    };
    const onTouch = (ev: Event) => {
      const e = ev as TouchEvent;
      // 위에서 넣는 합성 touchstart는 그대로 보낸다.
      if (!e.isTrusted) return;
      if (phase === "idle" && !inFrame(e)) return;
      const t = e.touches[0];
      if (e.type === "touchstart") {
        if (e.touches.length >= 2) {
          if (phase !== "page") {
            phase = "two";
            if (redirectTwo(e)) {
              e.stopPropagation();
              return;
            }
          }
        } else if (phase === "idle" && t) {
          start = { x: t.clientX, y: t.clientY };
          phase = "wait";
        }
      } else if (e.type === "touchmove" && phase === "wait" && t && start) {
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.hypot(dx, dy) > AXIS_SLOP) phase = e.cancelable && Math.abs(dx) > Math.abs(dy) && startMapDrag(t) ? "map" : "page";
      }
      const pass = passing();
      if (phase === "map" && e.type === "touchmove" && e.cancelable) e.preventDefault();
      if ((e.type === "touchend" || e.type === "touchcancel") && e.touches.length === 0) {
        phase = "idle";
        start = null;
      }
      if (!pass) e.stopPropagation();
    };
    const onPointer = (ev: Event) => {
      const e = ev as PointerEvent;
      if (e.pointerType !== "touch" || passing()) return;
      if (phase === "idle" && !inFrame(e)) return;
      e.stopPropagation();
    };
    for (const t of TOUCH_EVENTS) wrap.addEventListener(t, onTouch, { capture: true, passive: t !== "touchmove" });
    for (const t of POINTER_EVENTS) wrap.addEventListener(t, onPointer, { capture: true, passive: true });
    return () => {
      for (const t of TOUCH_EVENTS) wrap.removeEventListener(t, onTouch, { capture: true });
      for (const t of POINTER_EVENTS) wrap.removeEventListener(t, onPointer, { capture: true });
    };
  }, [axis]);

  const adapter: MapAdapterProps = { stores, selectedId, onSelect, me, near, focus, hoverId, labelTop, apiRef, onUserView };
  return (
    <div className="storemap" style={{ "--storemap-h": `${height}px` } as React.CSSProperties}>
      <div ref={wrapRef} className="storemap__wrap" data-touch-axis={axis ? "" : undefined}>
        {useKakao ? <Kakao {...adapter} onFail={() => setKakaoFailed(true)} /> : <Inner {...adapter} />}
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
