"use client";

import dynamic from "next/dynamic";
import type { JSX } from "react";
import type { Store } from "@/lib/stores";

export type StoreMapProps = {
  stores: Store[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  me: { lat: number; lng: number } | null;
  height?: number;
};

export const DEFAULT_MAP_HEIGHT = 360;

// Leaflet은 브라우저에서만 돈다. 코드, CSS, 타일은 지도가 처음 그려질 때 불러온다.
const Inner = dynamic(() => import("./StoreMapLeaflet"), {
  ssr: false,
  loading: () => <div className="storemap__frame storemap__frame--loading" aria-hidden="true" />,
});

/**
 * 매장 지도. 핀을 누르면 onSelect(id). 지도 이동과 확대는 API를 다시 부르지 않는다.
 * 좌표 없는 매장은 목록과 집계에 남기고, 지도 표시 수를 따로 적는다.
 */
export function StoreMap({ stores, selectedId, onSelect, me, height = DEFAULT_MAP_HEIGHT }: StoreMapProps): JSX.Element {
  const shown = stores.reduce((n, s) => (s.lat !== null && s.lng !== null ? n + 1 : n), 0);
  return (
    <div className="storemap" style={{ "--storemap-h": `${height}px` } as React.CSSProperties}>
      <Inner stores={stores} selectedId={selectedId} onSelect={onSelect} me={me} />
      <p className="storemap__count num">
        지도 표시 {shown}곳 / 전체 {stores.length}곳
      </p>
    </div>
  );
}
