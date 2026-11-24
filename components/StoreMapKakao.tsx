"use client";

import { useEffect, useRef, useState } from "react";
import { loadKakaoSdk } from "@/lib/kakao-sdk";
import { widthKm } from "@/lib/area-search";
import { type PinRank, clusterButton, clusterPins, markPin, panPinButton, pinButton, placePinTags, topRanked } from "@/lib/pin-label";
import { displayName } from "@/lib/store-view";
import type { MapAdapterProps } from "./StoreMap";

// 카카오 지도 어댑터. 공식 문서(https://apis.map.kakao.com/web/documentation/, 2026-11-23 확인):
//   동적 삽입은 스크립트 주소에 autoload=false를 붙이고 kakao.maps.load(callback)에서 지도를 만든다.
//   setBounds(bounds[, paddingTop, paddingRight, paddingBottom, paddingLeft]), CustomOverlay({ content, position, xAnchor, yAnchor, zIndex, clickable }),
//   setMap(null)로 제거, 크기를 바꾼 뒤에는 relayout(). 확대와 축소는 getLevel, setLevel(숫자가 작을수록 확대), 이동이 끝나면 idle 이벤트.
//   getProjection().containerPointFromCoords(latlng)는 지도 요소 좌상단 기준 화면 좌표(px)를 준다.
//   MarkerClusterer(libraries=clusterer)의 addMarker, addMarkers는 Marker만 받는다(CustomOverlay 아님). 핀이 CustomOverlay 버튼이라 묶음은 lib/pin-label.ts clusterPins로 직접 만든다.
//   기본 ZoomControl(세로 슬라이더)은 390px에서 자리를 많이 써서 쓰지 않고, StoreMap이 그리는 확대, 축소 버튼을 쓴다.
// 타일에 CSS 필터를 씌우지 않고, 카카오 로고와 저작권 표기를 가리지 않는다(운영정책 제5조 12, 13, 17항).
// SDK 로드나 인증이 실패하면 onFail을 불러 StoreMap이 Leaflet으로 넘어간다.

/* 쓰는 부분만 적은 최소 타입 */
type KLatLng = { getLat(): number; getLng(): number };
type KBounds = { extend(p: KLatLng): void; isEmpty(): boolean; contain(p: KLatLng): boolean; getSouthWest(): KLatLng; getNorthEast(): KLatLng };
type KMap = {
  setBounds(b: KBounds, t?: number, r?: number, bt?: number, l?: number): void;
  getBounds(): KBounds;
  getCenter(): KLatLng;
  panTo(p: KLatLng): void;
  setCenter(p: KLatLng): void;
  getLevel(): number;
  setLevel(lv: number): void;
  relayout(): void;
  getProjection(): { containerPointFromCoords(p: KLatLng): { x: number; y: number } };
};
type KOverlay = { setMap(m: KMap | null): void; getMap(): KMap | null; setZIndex(z: number): void };
type KakaoNS = {
  maps: {
    load(cb: () => void): void;
    Map: new (el: HTMLElement, o: { center: KLatLng; level: number }) => KMap;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new () => KBounds;
    CustomOverlay: new (o: { position: KLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number; clickable?: boolean; map?: KMap }) => KOverlay;
    event: { addListener(target: object, type: string, fn: () => void): void; removeListener(target: object, type: string, fn: () => void): void };
  };
};
declare global {
  interface Window {
    kakao?: KakaoNS;
  }
}

/** SDK를 한 번만 불러온다(lib/kakao-sdk.ts, 역지오코딩과 같은 스크립트). 실패하면 다음 시도를 위해 비운다 */
function loadKakao(): Promise<KakaoNS> {
  return loadKakaoSdk<KakaoNS>();
}

// 범위 맞춤 여백(px). 위는 상권 전체 보기 줄, 오른쪽은 확대, 축소, 내 위치 열을 비킨다.
const PAD = { top: 60, right: 60, bottom: 28, left: 28 };
/** 범위 맞춤이 이보다 더 확대하지 않는다(매장이 1곳일 때) */
const FIT_MIN_LEVEL = 3;
/** 기준점(역, 장소)이 있을 때 첫 화면 단계. 역, 주요 출구, 주변 골목이 읽히는 정도 */
const FOCUS_LEVEL = 4;
/** 내 위치로 옮길 때 이보다 넓게 보고 있으면 이 단계로 당긴다 */
const ME_LEVEL = 5;
/** 이 단계 이하로 확대하면 모든 핀에 가게 이름을 붙여 본다(겹치는 글자는 끈다). 그보다 넓으면 선택, 강조, 우선 매장만 */
const KAKAO_TAG_LEVEL = 3;
/** 이 단계 이하면 묶지 않는다. 같은 건물 매장처럼 확대해도 안 풀리는 묶음이 생기지 않게 한다 */
const NO_CLUSTER_LEVEL = 2;
const MIN_LEVEL = 1;
const MAX_LEVEL = 14;

/** 사용자 제스처(끌기, 휠, 두 손가락, 확대와 축소 버튼, 묶음 누름) 뒤 이 시간(ms) 안에 끝난 이동만 사용자 이동으로 본다 */
const GESTURE_MS = 1500;

type Pin = { ov: KOverlay; el: HTMLButtonElement; pos: KLatLng; rank: number | null };
type Mode = "home" | "all" | "user";

/** 카카오 로고와 축척 묶음. 가게 이름 글자가 덮지 않게 비켜 둔다(운영정책: 로고, 저작권 표기를 가리지 않는다) */
function kakaoMarks(box: HTMLElement): Element[] {
  const logo = box.querySelector('img[src*="mapjsapi/images"]');
  if (!logo) return [];
  let top: Element = logo;
  for (let e = logo.parentElement; e && e !== box && e.getBoundingClientRect().height < 40; e = e.parentElement) top = e;
  return [top];
}

export default function StoreMapKakao({ stores, selectedId, onSelect, me, near, focus, hoverId, labelTop, apiRef, onUserView, panStores, onPanPick, onFail }: MapAdapterProps & { onFail: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const kRef = useRef<KakaoNS | null>(null);
  const mapRef = useRef<KMap | null>(null);
  const pinsRef = useRef<Map<string, Pin>>(new Map());
  const clustersRef = useRef<{ ov: KOverlay; el: HTMLButtonElement; ids: string[] }[]>([]);
  const meRef = useRef<{ ov: KOverlay; pos: KLatLng } | null>(null);
  /** 옮긴 동네 핀. pinsRef와 따로 둔다(보기 맞춤, 묶음, 이름 글자에 넣지 않는다) */
  const panPinsRef = useRef<KOverlay[]>([]);
  const onPanPickRef = useRef(onPanPick);
  const labelTopRef = useRef(labelTop);
  const onSelectRef = useRef(onSelect);
  const failRef = useRef(onFail);
  const nearRef = useRef(near);
  const focusRef = useRef(focus);
  const selectedRef = useRef(selectedId);
  const hoverRef = useRef(hoverId);
  const modeRef = useRef<Mode>("home");
  /** 마지막 사용자 제스처 시각(performance.now). 현 지도에서 검색 버튼은 제스처로 시작된 이동에만 뜬다 */
  const gestureAtRef = useRef(0);
  /** 마지막으로 묶음을 계산한 단계. 단계가 그대로인 이동(끌기)에서는 다시 묶지 않는다 */
  const clusteredLevelRef = useRef<number | null>(null);
  // 지도가 준비되면 올려서 핀, 내 위치, 선택 효과를 다시 돌린다.
  const [readyTick, setReadyTick] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
    failRef.current = onFail;
    nearRef.current = near;
    focusRef.current = focus;
    selectedRef.current = selectedId;
    hoverRef.current = hoverId;
    labelTopRef.current = labelTop;
    onPanPickRef.current = onPanPick;
  }, [onSelect, onFail, near, focus, selectedId, hoverId, labelTop, onPanPick]);

  /** 지금 보기 상태대로 지도를 맞춘다. 사용자가 움직인 뒤(user)에는 그대로 둔다 */
  const applyView = () => {
    const k = kRef.current;
    const map = mapRef.current;
    const box = boxRef.current;
    if (!k || !map || !box || modeRef.current === "user" || box.clientWidth === 0 || box.clientHeight === 0) return;
    const f = focusRef.current;
    if (modeRef.current === "home" && f) {
      map.setLevel(FOCUS_LEVEL);
      map.setCenter(new k.maps.LatLng(f.lat, f.lng));
      return;
    }
    const b = new k.maps.LatLngBounds();
    for (const p of pinsRef.current.values()) b.extend(p.pos);
    if (nearRef.current && meRef.current) b.extend(meRef.current.pos);
    if (b.isEmpty()) return;
    map.setBounds(b, PAD.top, PAD.right, PAD.bottom, PAD.left);
    if (map.getLevel() < FIT_MIN_LEVEL) map.setLevel(FIT_MIN_LEVEL);
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
    const shown = [...pinsRef.current].filter(([, p]) => p.el.isConnected && view.contain(p.pos));
    const top = topRanked(shown.map(([id, p]) => ({ id, ccgRank: p.rank })), labelTopRef.current);
    const on = new Set(shown.map(([id]) => id));
    for (const [id, p] of pinsRef.current) if (!on.has(id) && p.el.dataset.tag) p.el.dataset.tag = "";
    const pins: { el: HTMLElement; rank: PinRank }[] = shown.map(([id, p]) => ({ el: p.el, rank: id === sel ? 0 : id === hov ? 1 : top.has(id) ? 2 : 3 }));
    placePinTags(box, pins, map.getLevel() <= KAKAO_TAG_LEVEL, [...kakaoMarks(box), ...clustersRef.current.map((c) => c.el)]);
  };

  /** 묶음 강조: 강조한 매장이 묶여 있으면 그 묶음을 강조한다 */
  const markClusters = () => {
    const hov = hoverRef.current;
    for (const c of clustersRef.current) c.el.classList.toggle("is-hover", hov !== null && c.ids.includes(hov));
  };

  /** 화면에서 겹치는 핀을 묶는다. 선택 매장과 목록에서 강조한 매장은 묶지 않는다(우선 매장까지 빼면 묶음 위에 핀이 겹쳐 누를 수 없다). 단계가 바뀌거나 핀, 선택이 바뀔 때만 다시 계산한다 */
  const recluster = () => {
    const k = kRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    clusteredLevelRef.current = map.getLevel();
    for (const c of clustersRef.current) c.ov.setMap(null);
    clustersRef.current = [];
    const pins = pinsRef.current;
    const sel = selectedRef.current;
    const proj = map.getProjection();
    const groups =
      map.getLevel() <= NO_CLUSTER_LEVEL
        ? []
        : clusterPins(
            [...pins].map(([id, p]) => {
              const pt = proj.containerPointFromCoords(p.pos);
              return { id, x: pt.x, y: pt.y };
            }),
            new Set([sel, hoverRef.current].filter((v): v is string => v !== null)),
          );
    const hidden = new Set(groups.flat());
    for (const [id, p] of pins) {
      if (hidden.has(id)) {
        if (p.ov.getMap()) p.ov.setMap(null);
      } else if (!p.ov.getMap()) p.ov.setMap(map);
    }
    for (const ids of groups) {
      const b = new k.maps.LatLngBounds();
      let lat = 0;
      let lng = 0;
      for (const id of ids) {
        const pos = (pins.get(id) as Pin).pos;
        b.extend(pos);
        lat += pos.getLat();
        lng += pos.getLng();
      }
      const el = clusterButton(ids.length, () => {
        modeRef.current = "user";
        gestureAtRef.current = performance.now();
        map.setBounds(b, PAD.top, PAD.right, PAD.bottom, PAD.left);
        if (map.getLevel() < NO_CLUSTER_LEVEL) map.setLevel(NO_CLUSTER_LEVEL);
      });
      const ov = new k.maps.CustomOverlay({ position: new k.maps.LatLng(lat / ids.length, lng / ids.length), content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 5, clickable: true, map });
      clustersRef.current.push({ ov, el, ids });
    }
    markClusters();
  };

  // SDK를 불러와 지도를 한 번 만든다.
  useEffect(() => {
    let alive = true;
    const box = boxRef.current;
    if (!box) return;
    let idleOff: (() => void) | null = null;
    loadKakao()
      .then((k) => {
        if (!alive) return;
        kRef.current = k;
        const map = new k.maps.Map(box, { center: new k.maps.LatLng(37.5665, 126.978), level: 6 });
        mapRef.current = map;
        // 이동이 끝나면: 단계가 바뀌었으면 다시 묶고, 새로 화면에 들어온 핀이 붙은 뒤(다음 프레임)에 글자를 한 번 더 놓는다.
        const onIdle = () => {
          if (clusteredLevelRef.current !== map.getLevel()) recluster();
          tags();
          window.requestAnimationFrame(() => tags());
        };
        k.maps.event.addListener(map, "idle", onIdle);
        idleOff = () => k.maps.event.removeListener(map, "idle", onIdle);
        apiRef.current = {
          zoomIn: () => {
            modeRef.current = "user";
            gestureAtRef.current = performance.now();
            map.setLevel(Math.max(MIN_LEVEL, map.getLevel() - 1));
          },
          zoomOut: () => {
            modeRef.current = "user";
            gestureAtRef.current = performance.now();
            map.setLevel(Math.min(MAX_LEVEL, map.getLevel() + 1));
          },
          fit: () => {
            modeRef.current = "all";
            applyView();
          },
          centerMe: () => {
            const m = meRef.current;
            if (!m) return;
            modeRef.current = "user";
            if (map.getLevel() > ME_LEVEL) map.setLevel(ME_LEVEL);
            map.setCenter(m.pos);
          },
          touchPan: () => {
            modeRef.current = "user";
            gestureAtRef.current = performance.now();
          },
        };
        setReadyTick((v) => v + 1);
      })
      .catch(() => {
        if (alive) failRef.current();
      });
    // 사용자가 지도를 만지면(끌기, 휠) 그 뒤로는 보기를 다시 맞추지 않는다. 핀과 묶음 버튼 누름은 만짐으로 치지 않는다.
    const touched = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".smpin, .smclu")) return;
      modeRef.current = "user";
    };
    box.addEventListener("pointerdown", touched);
    box.addEventListener("wheel", touched, { passive: true });
    // 화면 폭이나 높이가 바뀌어 지도 크기가 바뀌면 다시 그리고, 보기 상태가 home이나 all이면 그 규칙대로 다시 맞춘다.
    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return;
      mapRef.current.relayout();
      applyView();
      tags();
    });
    ro.observe(box);
    const pins = pinsRef.current;
    return () => {
      alive = false;
      ro.disconnect();
      idleOff?.();
      box.removeEventListener("pointerdown", touched);
      box.removeEventListener("wheel", touched);
      for (const p of pins.values()) p.ov.setMap(null);
      pins.clear();
      for (const c of clustersRef.current) c.ov.setMap(null);
      clustersRef.current = [];
      meRef.current?.ov.setMap(null);
      for (const ov of panPinsRef.current) ov.setMap(null);
      panPinsRef.current = [];
      mapRef.current = null;
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀은 매장 id 집합이 바뀔 때만 다시 만든다. 바뀌면 첫 화면 규칙으로 돌아간다.
  const idsKey = stores
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    const k = kRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    for (const p of pinsRef.current.values()) p.ov.setMap(null);
    pinsRef.current.clear();
    for (const s of stores) {
      if (s.lat === null || s.lng === null) continue;
      const pos = new k.maps.LatLng(s.lat, s.lng);
      const el = pinButton(displayName(s.name), s.id, (b) => onSelectRef.current(s.id, b));
      const ov = new k.maps.CustomOverlay({ position: pos, content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 1, clickable: true });
      pinsRef.current.set(s.id, { ov, el, pos, rank: s.ccgRank });
    }
    modeRef.current = "home";
    applyView();
    recluster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, readyTick]);

  // 옮긴 동네 핀: 매장 id 집합이 바뀔 때만 다시 그린다. 지금 범위 핀 아래에 두고 보기 상태는 건드리지 않는다.
  const panKey = (panStores ?? [])
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    const k = kRef.current;
    const map = mapRef.current;
    for (const ov of panPinsRef.current) ov.setMap(null);
    panPinsRef.current = [];
    if (!k || !map) return;
    for (const s of panStores ?? []) {
      if (s.lat === null || s.lng === null) continue;
      const el = panPinButton(displayName(s.name), s.id, () => onPanPickRef.current?.(s.id));
      panPinsRef.current.push(new k.maps.CustomOverlay({ position: new k.maps.LatLng(s.lat, s.lng), content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 0, clickable: true, map }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panKey, readyTick]);

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
    const k = kRef.current;
    const map = mapRef.current;
    if (!k || !map) return;
    meRef.current?.ov.setMap(null);
    meRef.current = null;
    if (me) {
      const el = document.createElement("span");
      el.className = "smme";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "현재 위치 표시");
      el.innerHTML = '<span class="smme__dot"></span>';
      const pos = new k.maps.LatLng(me.lat, me.lng);
      meRef.current = { ov: new k.maps.CustomOverlay({ position: pos, content: el, zIndex: 20, map }), pos };
    }
    if (nearRef.current) applyView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, readyTick]);

  // 선택: 표시를 바꾸고 선택 핀을 묶음에서 뺀다. 화면 밖이면 그 핀으로 옮긴다(옮기면 idle에서 글자를 다시 놓는다).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    recluster();
    let moved = false;
    for (const [id, p] of pinsRef.current) {
      const on = id === selectedId;
      markPin(p.el, on, id === hoverRef.current);
      p.ov.setZIndex(on ? 10 : 1);
      if (on && !map.getBounds().contain(p.pos)) {
        map.panTo(p.pos);
        moved = true;
      }
    }
    if (!moved) tags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, idsKey, readyTick]);

  // 목록 강조: 강조한 매장을 묶음에서 빼고 핀과 이름을 강조한다. 범위와 이동은 건드리지 않는다.
  useEffect(() => {
    recluster();
    for (const [id, p] of pinsRef.current) {
      markPin(p.el, id === selectedRef.current, id === hoverId);
      if (id !== selectedRef.current) p.ov.setZIndex(id === hoverId ? 9 : 1);
    }
    tags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId]);

  // 현 지도에서 검색(홈 지도만): 사용자 상태에서 범위가 바뀌면 그 범위와 제스처 여부를, 자동 맞춤(home, all)이면 null을 알린다.
  // 제스처 여부: 끌기, 휠, 두 손가락, 확대와 축소 버튼, 묶음 누름 뒤 GESTURE_MS 안에 끝난 이동. 빈 지도 탭만으로 user가 된 뒤
  // 목록 선택의 panTo로 바뀐 범위는 제스처가 아니다(받는 쪽이 버튼을 새로 띄우지 않는다).
  // 자동 맞춤 뒤의 중심과 단계를 기준으로 두고, 사용자 상태라도 기준과 같으면 알리지 않는다(빈 지도를 누른 뒤 크기만 바뀐 경우).
  const onUserViewRef = useRef(onUserView);
  useEffect(() => {
    onUserViewRef.current = onUserView;
  }, [onUserView]);
  useEffect(() => {
    const k = kRef.current;
    const map = mapRef.current;
    const box = boxRef.current;
    if (!k || !map || !box) return;
    const mark = () => {
      gestureAtRef.current = performance.now();
    };
    const markTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        modeRef.current = "user";
        mark();
      }
    };
    k.maps.event.addListener(map, "dragstart", mark);
    k.maps.event.addListener(map, "dragend", mark);
    box.addEventListener("wheel", mark, { passive: true });
    box.addEventListener("touchstart", markTouch, { passive: true });
    box.addEventListener("touchmove", markTouch, { passive: true });
    const keyNow = () => {
      const c = map.getCenter();
      return `${c.getLat().toFixed(6)},${c.getLng().toFixed(6)},${map.getLevel()}`;
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
      cb({ lat: c.getLat(), lng: c.getLng(), widthKm: widthKm(c.getLat(), b.getSouthWest().getLng(), b.getNorthEast().getLng()) }, performance.now() - gestureAtRef.current < GESTURE_MS);
    };
    k.maps.event.addListener(map, "idle", report);
    return () => {
      k.maps.event.removeListener(map, "idle", report);
      k.maps.event.removeListener(map, "dragstart", mark);
      k.maps.event.removeListener(map, "dragend", mark);
      box.removeEventListener("wheel", mark);
      box.removeEventListener("touchstart", markTouch);
      box.removeEventListener("touchmove", markTouch);
    };
  }, [readyTick]);

  return <div ref={boxRef} className="storemap__frame" role="region" aria-label="매장 지도" />;
}
