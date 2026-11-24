"use client";

import "@/app/storemap.css";
import dynamic from "next/dynamic";
import { type JSX, type RefObject, useId, useRef, useState } from "react";
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
};

/** 지도 위 버튼이 어댑터에 시키는 일. 어댑터가 지도를 만든 뒤 채운다 */
export type MapApi = {
  zoomIn(): void;
  zoomOut(): void;
  /** 상권 전체 보기: 모든 핀(near일 때만 내 위치 포함) 범위로 맞춘다 */
  fit(): void;
  /** 내 위치가 있으면 그 자리를 가운데로. 없으면 아무것도 안 한다 */
  centerMe(): void;
};

/**
 * 어댑터가 받는 props. 버튼은 StoreMap이 그리고, 어댑터는 지도, 핀, 묶음만 맡는다.
 * 보기 상태는 어댑터 안에서 하나로 관리한다: home(첫 화면 규칙), all(상권 전체 보기), user(사용자가 움직인 뒤에는 그대로 둔다).
 */
export type MapAdapterProps = Pick<StoreMapProps, "stores" | "selectedId" | "onSelect" | "me"> & {
  near: boolean;
  focus: Point | null;
  hoverId: string | null;
  labelTop: number;
  apiRef: RefObject<MapApi | null>;
};

const DEFAULT_MAP_HEIGHT = 360;

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
}: StoreMapProps): JSX.Element {
  const [kakaoFailed, setKakaoFailed] = useState(false);
  const useKakao = MAP_PROVIDER === "kakao" && !kakaoFailed;
  const apiRef = useRef<MapApi | null>(null);
  const noteId = useId();
  const adapter: MapAdapterProps = { stores, selectedId, onSelect, me, near, focus, hoverId, labelTop, apiRef };
  return (
    <div className="storemap" style={{ "--storemap-h": `${height}px` } as React.CSSProperties}>
      <div className="storemap__wrap">
        {useKakao ? <Kakao {...adapter} onFail={() => setKakaoFailed(true)} /> : <Inner {...adapter} />}
        <button type="button" className="storemap__fit" data-map-ctl="" onClick={() => apiRef.current?.fit()}>
          상권 전체 보기
        </button>
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
