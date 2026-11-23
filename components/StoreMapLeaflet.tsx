"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { displayName } from "@/lib/store-view";
import type { StoreMapProps } from "./StoreMap";

// OSM 표준 타일(tile.openstreetmap.org). 정책: https://operations.osmfoundation.org/policies/tiles/
// 밝은 회색은 CSS 필터(.storemap__tiles)로 만든다. 출처 표기는 지도 오른쪽 아래에 늘 보인다.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const FIT_PADDING: L.PointTuple = [28, 28];
const FIT_MAX_ZOOM = 17;

function pinIcon(): L.DivIcon {
  return L.divIcon({ className: "smpin", html: '<span class="smpin__dot"></span>', iconSize: [44, 44], iconAnchor: [22, 22] });
}

function meIcon(): L.DivIcon {
  return L.divIcon({ className: "smme", html: '<span class="smme__dot"></span>', iconSize: [28, 28], iconAnchor: [14, 14] });
}

/** 유효한 핀과 내 위치로 범위를 맞춘다. 아무것도 없으면 false */
function fitAll(map: L.Map, markers: Map<string, L.Marker>, me: L.Marker | null): boolean {
  // 숨겨진 지도(크기 0)에서 맞추면 범위가 틀어진다. 보일 때 다시 맞추도록 false를 돌려준다.
  const size = map.getContainer();
  if (size.clientWidth === 0 || size.clientHeight === 0) return false;
  const b = L.latLngBounds([]);
  for (const m of markers.values()) b.extend(m.getLatLng());
  if (me) b.extend(me.getLatLng());
  if (!b.isValid()) return false;
  map.fitBounds(b, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, animate: false });
  return true;
}

export default function StoreMapLeaflet({ stores, selectedId, onSelect, me }: Omit<StoreMapProps, "height">) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const meRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const fittedRef = useRef(false);
  const pendingFitRef = useRef(false);
  const userMovedRef = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // 지도는 한 번만 만든다.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const map = L.map(box, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, tapTolerance: 20, center: [37.5665, 126.978], zoom: 12 });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, className: "storemap__tiles" }).addTo(map);
    L.control.zoom({ position: "topright", zoomInTitle: "확대", zoomOutTitle: "축소" }).addTo(map);
    mapRef.current = map;
    // 목록/지도 전환처럼 크기가 바뀌면 타일을 다시 맞춘다.
    // 사용자가 지도를 만지기 전까지는 크기가 바뀔 때마다 범위를 다시 맞춘다.
    const touched = () => {
      userMovedRef.current = true;
    };
    box.addEventListener("pointerdown", touched);
    box.addEventListener("wheel", touched, { passive: true });
    box.addEventListener("keydown", touched);
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if ((pendingFitRef.current || !userMovedRef.current) && fitAll(map, markersRef.current, meRef.current)) pendingFitRef.current = false;
    });
    ro.observe(box);
    const markers = markersRef.current;
    return () => {
      box.removeEventListener("pointerdown", touched);
      box.removeEventListener("wheel", touched);
      box.removeEventListener("keydown", touched);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markers.clear();
      meRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // 핀은 매장 id 집합이 바뀔 때만 다시 그린다(같은 집합의 새 배열이면 그대로 둔다).
  const idsKey = stores
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    for (const m of markers.values()) m.remove();
    markers.clear();
    for (const s of stores) {
      if (s.lat === null || s.lng === null) continue;
      const name = displayName(s.name);
      const m = L.marker([s.lat, s.lng], { icon: pinIcon(), title: name, alt: name, keyboard: true, riseOnHover: true });
      m.on("click", () => onSelectRef.current(s.id));
      m.on("keypress", (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === "Enter" || e.originalEvent.key === " ") onSelectRef.current(s.id);
      });
      m.addTo(map);
      const el = m.getElement();
      if (el) {
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `${name} 영수증 열기`);
        el.dataset.id = s.id;
      }
      markers.set(s.id, m);
    }
    pendingFitRef.current = !fitAll(map, markers, meRef.current);
    fittedRef.current = true;
    // idsKey가 같으면 같은 핀 집합이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // 내 위치 표시. 처음 생기면 범위를 다시 맞춘다.
  const meKey = me ? `${me.lat},${me.lng}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    meRef.current?.remove();
    meRef.current = null;
    if (me) {
      meRef.current = L.marker([me.lat, me.lng], { icon: meIcon(), title: "내 위치", alt: "내 위치", keyboard: false, interactive: false, zIndexOffset: 2000 }).addTo(map);
    }
    if (fittedRef.current) pendingFitRef.current = !fitAll(map, markersRef.current, meRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  // 선택 표시만 바꾼다. 화면 밖이면 그 핀으로 옮기되 범위를 다시 맞추지는 않는다.
  useEffect(() => {
    const map = mapRef.current;
    for (const [id, m] of markersRef.current) {
      const on = id === selectedId;
      const el = m.getElement();
      el?.classList.toggle("is-selected", on);
      el?.setAttribute("aria-pressed", on ? "true" : "false");
      m.setZIndexOffset(on ? 1000 : 0);
      if (on && map && !map.getBounds().contains(m.getLatLng())) map.panTo(m.getLatLng(), { animate: false });
    }
  }, [selectedId, idsKey]);

  const fitButton = () => {
    const map = mapRef.current;
    if (!map) return;
    userMovedRef.current = false;
    fitAll(map, markersRef.current, meRef.current);
  };

  return (
    <div className="storemap__wrap">
      <div ref={boxRef} className="storemap__frame" role="region" aria-label="매장 지도" />
      <button type="button" className="storemap__fit" onClick={fitButton}>
        상권 전체 보기
      </button>
    </div>
  );
}
