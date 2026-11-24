"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { TILE_ATTRIBUTION, TILE_GRAYSCALE, TILE_MAX_ZOOM, TILE_URL } from "@/lib/map-tiles";
import { widthKm } from "@/lib/area-search";
import { type PinRank, clusterButton, clusterPins, markPin, pinButton, placePinTags, topRanked } from "@/lib/pin-label";
import { displayName } from "@/lib/store-view";
import type { MapAdapterProps } from "./StoreMap";

// 타일 주소, 출처, 회색 처리 여부는 lib/map-tiles.ts 한 곳에서 정한다.
// 확대, 축소, 상권 전체 보기, 내 위치 버튼은 StoreMap이 그린다. 카카오 어댑터와 같은 동작을 한다.
// 핀과 묶음은 버튼 요소를 divIcon에 넣는다. 묶였다 풀린 핀도 같은 버튼 요소가 다시 붙는다(포커스 복귀 자리 유지).
// 범위 맞춤 여백: 위는 상권 전체 보기 줄, 오른쪽은 확대, 축소, 내 위치 열을 비킨다.
const FIT_TOP_LEFT: L.PointTuple = [28, 60];
const FIT_BOTTOM_RIGHT: L.PointTuple = [60, 28];
const FIT_MAX_ZOOM = 17;
/** 기준점(역, 장소)이 있을 때 첫 화면 축척. 역, 주요 출구, 주변 골목이 읽히는 정도(카카오 단계 4와 같은 축척) */
const FOCUS_ZOOM = 16;
/** 내 위치로 옮길 때 이보다 넓게 보고 있으면 이 단계로 당긴다 */
const ME_ZOOM = 15;
/** 이 단계 이상 확대하면 모든 핀에 가게 이름을 붙여 본다(겹치는 글자는 끈다). 그보다 넓으면 선택, 강조, 우선 매장만. 카카오 단계 3과 같은 축척 */
const TAG_ZOOM = 17;
/** 이 단계 이상이면 묶지 않는다. 같은 건물 매장처럼 확대해도 안 풀리는 묶음이 생기지 않게 한다 */
const NO_CLUSTER_ZOOM = 18;

/** 사용자 제스처(끌기, 휠, 두 손가락, 방향키, 확대와 축소 버튼, 묶음 누름) 뒤 이 시간(ms) 안에 끝난 이동만 사용자 이동으로 본다 */
const GESTURE_MS = 1500;
/** 지도를 옮기는 방향키와 확대, 축소 키 */
const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-", "=", "_"]);

type Pin = { m: L.Marker; el: HTMLButtonElement; at: L.LatLng; rank: number | null };
type Mode = "home" | "all" | "user";

function meIcon(): L.DivIcon {
  return L.divIcon({ className: "smme", html: '<span class="smme__dot"></span>', iconSize: [28, 28], iconAnchor: [14, 14] });
}

export default function StoreMapLeaflet({ stores, selectedId, onSelect, me, near, focus, hoverId, labelTop, apiRef, onUserView }: MapAdapterProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinsRef = useRef<Map<string, Pin>>(new Map());
  const clustersRef = useRef<{ m: L.Marker; el: HTMLButtonElement; ids: string[] }[]>([]);
  const meRef = useRef<L.Marker | null>(null);
  const labelTopRef = useRef(labelTop);
  const onSelectRef = useRef(onSelect);
  const nearRef = useRef(near);
  const focusRef = useRef(focus);
  const selectedRef = useRef(selectedId);
  const hoverRef = useRef(hoverId);
  const modeRef = useRef<Mode>("home");
  const pendingRef = useRef(false);
  /** 마지막 사용자 제스처 시각(performance.now). 현 지도에서 검색 버튼은 제스처로 시작된 이동에만 뜬다 */
  const gestureAtRef = useRef(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
    nearRef.current = near;
    focusRef.current = focus;
    selectedRef.current = selectedId;
    hoverRef.current = hoverId;
    labelTopRef.current = labelTop;
  }, [onSelect, near, focus, selectedId, hoverId, labelTop]);

  /** 지금 보기 상태대로 지도를 맞춘다. 사용자가 움직인 뒤(user)에는 그대로 둔다. 숨겨진 지도(크기 0)에서는 보일 때로 미룬다 */
  const applyView = () => {
    const map = mapRef.current;
    const box = boxRef.current;
    if (!map || !box || modeRef.current === "user") return;
    if (box.clientWidth === 0 || box.clientHeight === 0) {
      pendingRef.current = true;
      return;
    }
    pendingRef.current = false;
    const f = focusRef.current;
    if (modeRef.current === "home" && f) {
      map.setView([f.lat, f.lng], FOCUS_ZOOM, { animate: false });
      return;
    }
    const b = L.latLngBounds([]);
    for (const p of pinsRef.current.values()) b.extend(p.at);
    if (nearRef.current && meRef.current) b.extend(meRef.current.getLatLng());
    if (!b.isValid()) return;
    map.fitBounds(b, { paddingTopLeft: FIT_TOP_LEFT, paddingBottomRight: FIT_BOTTOM_RIGHT, maxZoom: FIT_MAX_ZOOM, animate: false });
  };

  /** 가게 이름 글자를 다시 놓는다 */
  const tags = () => {
    const map = mapRef.current;
    const box = boxRef.current;
    if (!map || !box) return;
    const sel = selectedRef.current;
    const hov = hoverRef.current;
    const view = map.getBounds();
    // 우선 매장은 지금 화면 안에 핀으로 보이는 매장 중 매출 상위 몇 곳이다(묶였거나 화면 밖인 매장은 고르지 않는다).
    const shown = [...pinsRef.current].filter(([, p]) => map.hasLayer(p.m) && view.contains(p.at));
    const top = topRanked(shown.map(([id, p]) => ({ id, ccgRank: p.rank })), labelTopRef.current);
    const on = new Set(shown.map(([id]) => id));
    for (const [id, p] of pinsRef.current) if (!on.has(id) && p.el.dataset.tag) p.el.dataset.tag = "";
    const pins: { el: HTMLElement; rank: PinRank }[] = shown.map(([id, p]) => ({ el: p.el, rank: id === sel ? 0 : id === hov ? 1 : top.has(id) ? 2 : 3 }));
    const keep = [...box.querySelectorAll(".leaflet-control"), ...clustersRef.current.map((c) => c.el)];
    placePinTags(box, pins, map.getZoom() >= TAG_ZOOM, keep);
  };

  /** 묶음 강조: 강조한 매장이 묶여 있으면 그 묶음을 강조한다 */
  const markClusters = () => {
    const hov = hoverRef.current;
    for (const c of clustersRef.current) c.el.classList.toggle("is-hover", hov !== null && c.ids.includes(hov));
  };

  /** 화면에서 겹치는 핀을 묶는다. 선택 매장과 목록에서 강조한 매장은 묶지 않는다(우선 매장까지 빼면 묶음 위에 핀이 겹쳐 누를 수 없다). 축척이 바뀌거나 핀, 선택이 바뀔 때만 다시 계산한다 */
  const recluster = () => {
    const map = mapRef.current;
    if (!map) return;
    for (const c of clustersRef.current) c.m.remove();
    clustersRef.current = [];
    const pins = pinsRef.current;
    const sel = selectedRef.current;
    const groups =
      map.getZoom() >= NO_CLUSTER_ZOOM
        ? []
        : clusterPins(
            [...pins].map(([id, p]) => {
              const pt = map.latLngToContainerPoint(p.at);
              return { id, x: pt.x, y: pt.y };
            }),
            new Set([sel, hoverRef.current].filter((v): v is string => v !== null)),
          );
    const hidden = new Set(groups.flat());
    for (const [id, p] of pins) {
      if (hidden.has(id)) p.m.remove();
      else if (!map.hasLayer(p.m)) p.m.addTo(map);
    }
    for (const ids of groups) {
      const b = L.latLngBounds(ids.map((id) => (pins.get(id) as Pin).at));
      const el = clusterButton(ids.length, () => {
        modeRef.current = "user";
        gestureAtRef.current = performance.now();
        map.fitBounds(b, { paddingTopLeft: FIT_TOP_LEFT, paddingBottomRight: FIT_BOTTOM_RIGHT, maxZoom: NO_CLUSTER_ZOOM });
      });
      L.DomEvent.disableClickPropagation(el);
      const m = L.marker(b.getCenter(), {
        icon: L.divIcon({ className: "smclu-wrap", html: el, iconSize: [44, 44], iconAnchor: [22, 22] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 500,
      }).addTo(map);
      clustersRef.current.push({ m, el, ids });
    }
    markClusters();
  };

  // 지도는 한 번만 만든다.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = L.map(box, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      tapTolerance: 20,
      center: [37.5665, 126.978],
      zoom: 12,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    });
    // 지도 영역 안의 타일 출처(OpenStreetMap). 오른쪽 버튼 열과 겹치지 않게 왼쪽 아래에 둔다.
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
    L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION, className: TILE_GRAYSCALE ? "storemap__tiles" : "" }).addTo(map);
    mapRef.current = map;
    const onZoom = () => {
      recluster();
      tags();
    };
    map.on("zoomend", onZoom);
    map.on("moveend", tags);
    apiRef.current = {
      zoomIn: () => {
        modeRef.current = "user";
        gestureAtRef.current = performance.now();
        map.zoomIn();
      },
      zoomOut: () => {
        modeRef.current = "user";
        gestureAtRef.current = performance.now();
        map.zoomOut();
      },
      fit: () => {
        modeRef.current = "all";
        applyView();
      },
      centerMe: () => {
        const m = meRef.current;
        if (!m) return;
        modeRef.current = "user";
        map.setView(m.getLatLng(), Math.max(map.getZoom(), ME_ZOOM), { animate: !still });
      },
      touchPan: () => {
        modeRef.current = "user";
        gestureAtRef.current = performance.now();
      },
    };
    // 사용자가 지도를 만지면(끌기, 휠, 방향키) 그 뒤로는 보기를 다시 맞추지 않는다. 핀과 묶음 버튼 누름은 만짐으로 치지 않는다.
    const touched = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".smpin, .smclu")) return;
      modeRef.current = "user";
    };
    box.addEventListener("pointerdown", touched);
    box.addEventListener("wheel", touched, { passive: true });
    box.addEventListener("keydown", touched);
    // 화면 폭이나 높이가 바뀌어 지도 크기가 바뀌면 타일을 다시 맞추고, 보기 상태가 home이나 all이면 그 규칙대로 다시 맞춘다.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (pendingRef.current || modeRef.current !== "user") applyView();
      tags();
    });
    ro.observe(box);
    const pins = pinsRef.current;
    return () => {
      box.removeEventListener("pointerdown", touched);
      box.removeEventListener("wheel", touched);
      box.removeEventListener("keydown", touched);
      ro.disconnect();
      map.off("zoomend", onZoom);
      map.off("moveend", tags);
      map.remove();
      mapRef.current = null;
      apiRef.current = null;
      pins.clear();
      clustersRef.current = [];
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀은 매장 id 집합이 바뀔 때만 다시 만든다(같은 집합의 새 배열이면 그대로 둔다). 바뀌면 첫 화면 규칙으로 돌아간다.
  const idsKey = stores
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pins = pinsRef.current;
    for (const p of pins.values()) p.m.remove();
    pins.clear();
    for (const s of stores) {
      if (s.lat === null || s.lng === null) continue;
      const el = pinButton(displayName(s.name), s.id, (b) => onSelectRef.current(s.id, b));
      L.DomEvent.disableClickPropagation(el);
      const at = L.latLng(s.lat, s.lng);
      const m = L.marker(at, { icon: L.divIcon({ className: "smpin-wrap", html: el, iconSize: [44, 44], iconAnchor: [22, 22] }), interactive: false, keyboard: false });
      pins.set(s.id, { m, el, at, rank: s.ccgRank });
    }
    modeRef.current = "home";
    applyView();
    recluster();
    tags();
    // idsKey가 같으면 같은 핀 집합이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // 기준점이나 내 주변 모드가 바뀌면 첫 화면 규칙으로 다시 맞춘다.
  const focusKey = focus ? `${focus.lat},${focus.lng}` : "";
  useEffect(() => {
    if (!mapRef.current) return;
    modeRef.current = "home";
    applyView();
  }, [focusKey, near]);

  // 내 위치 점. 화면 안에 들어오면 보인다. 범위에는 내 주변 모드일 때만 넣는다.
  const meKey = me ? `${me.lat},${me.lng}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    meRef.current?.remove();
    meRef.current = null;
    if (me) {
      meRef.current = L.marker([me.lat, me.lng], { icon: meIcon(), title: "현재 위치 표시", alt: "현재 위치 표시", keyboard: false, interactive: false, zIndexOffset: 2000 }).addTo(map);
    }
    if (nearRef.current) applyView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  // 선택: 표시를 바꾸고 선택 핀을 묶음에서 뺀다. 화면 밖이면 그 핀으로 옮기되 범위를 다시 맞추지는 않는다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    recluster();
    for (const [id, p] of pinsRef.current) {
      const on = id === selectedId;
      markPin(p.el, on, id === hoverRef.current);
      p.m.setZIndexOffset(on ? 1000 : 0);
      if (on && !map.getBounds().contains(p.at)) map.panTo(p.at, { animate: false });
    }
    tags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, idsKey]);

  // 목록 강조: 강조한 매장을 묶음에서 빼고 핀과 이름을 강조한다. 범위와 이동은 건드리지 않는다.
  useEffect(() => {
    recluster();
    for (const [id, p] of pinsRef.current) {
      markPin(p.el, id === selectedRef.current, id === hoverId);
      if (id !== selectedRef.current) p.m.setZIndexOffset(id === hoverId ? 900 : 0);
    }
    tags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId]);

  // 현 지도에서 검색(홈 지도만): 사용자 상태에서 범위가 바뀌면 그 범위와 제스처 여부를, 자동 맞춤(home, all)이면 null을 알린다.
  // 제스처 여부: 끌기, 휠, 두 손가락, 방향키, 확대와 축소 버튼, 묶음 누름 뒤 GESTURE_MS 안에 끝난 이동. 빈 지도 탭만으로 user가 된 뒤
  // 목록 선택의 panTo로 바뀐 범위는 제스처가 아니다(받는 쪽이 버튼을 새로 띄우지 않는다).
  // 자동 맞춤 뒤의 중심과 단계를 기준으로 두고, 사용자 상태라도 기준과 같으면 알리지 않는다(빈 지도를 누른 뒤 크기만 바뀐 경우).
  const onUserViewRef = useRef(onUserView);
  useEffect(() => {
    onUserViewRef.current = onUserView;
  }, [onUserView]);
  useEffect(() => {
    const map = mapRef.current;
    const box = boxRef.current;
    if (!map || !box) return;
    const mark = () => {
      gestureAtRef.current = performance.now();
    };
    const markTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        modeRef.current = "user";
        mark();
      }
    };
    const markKey = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.key)) mark();
    };
    map.on("dragstart dragend", mark);
    box.addEventListener("wheel", mark, { passive: true });
    box.addEventListener("touchstart", markTouch, { passive: true });
    box.addEventListener("touchmove", markTouch, { passive: true });
    box.addEventListener("keydown", markKey);
    const keyNow = () => {
      const c = map.getCenter();
      return `${c.lat.toFixed(6)},${c.lng.toFixed(6)},${map.getZoom()}`;
    };
    let base = modeRef.current === "user" ? "" : keyNow();
    const report = () => {
      const cb = onUserViewRef.current;
      if (!cb) return;
      const key = keyNow();
      if (modeRef.current !== "user") {
        base = key;
        cb(null, false);
        return;
      }
      if (key === base) return;
      const c = map.getCenter();
      const b = map.getBounds();
      cb({ lat: c.lat, lng: c.lng, widthKm: widthKm(c.lat, b.getWest(), b.getEast()) }, performance.now() - gestureAtRef.current < GESTURE_MS);
    };
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
      map.off("dragstart dragend", mark);
      box.removeEventListener("wheel", mark);
      box.removeEventListener("touchstart", markTouch);
      box.removeEventListener("touchmove", markTouch);
      box.removeEventListener("keydown", markKey);
    };
  }, []);

  return <div ref={boxRef} className="storemap__frame" role="region" aria-label="매장 지도" />;
}
