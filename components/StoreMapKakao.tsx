"use client";

import { useEffect, useRef, useState } from "react";
import { GEOCODE_CREDIT, NOMINATIM_ON } from "@/lib/geocode";
import { KAKAO_MAP_KEY } from "@/lib/map-provider";
import { displayName } from "@/lib/store-view";
import type { StoreMapProps } from "./StoreMap";

// 카카오 지도 어댑터. 공식 문서(https://apis.map.kakao.com/web/documentation/, 2026-11-23 확인):
//   동적 삽입은 스크립트 주소에 autoload=false를 붙이고 kakao.maps.load(callback)에서 지도를 만든다.
//   setBounds(bounds[, paddingTop, paddingRight, paddingBottom, paddingLeft]), CustomOverlay({ content, position, xAnchor, yAnchor, zIndex, clickable }),
//   setMap(null)로 제거, 크기를 바꾼 뒤에는 relayout().
// 타일에 CSS 필터를 씌우지 않고, 카카오 로고와 저작권 표기를 가리지 않는다(운영정책 제5조 12, 13, 17항).
// SDK 로드나 인증이 실패하면 onFail을 불러 StoreMap이 Leaflet으로 넘어간다.

/* 쓰는 부분만 적은 최소 타입 */
type KLatLng = object;
type KBounds = { extend(p: KLatLng): void; isEmpty(): boolean; contain(p: KLatLng): boolean };
type KMap = {
  setBounds(b: KBounds, t?: number, r?: number, bt?: number, l?: number): void;
  getBounds(): KBounds;
  panTo(p: KLatLng): void;
  relayout(): void;
  addControl(c: object, pos: unknown): void;
};
type KOverlay = { setMap(m: KMap | null): void; setZIndex(z: number): void };
type KakaoNS = {
  maps: {
    load(cb: () => void): void;
    Map: new (el: HTMLElement, o: { center: KLatLng; level: number }) => KMap;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new () => KBounds;
    CustomOverlay: new (o: { position: KLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number; clickable?: boolean; map?: KMap }) => KOverlay;
    ZoomControl: new () => object;
    ControlPosition: { RIGHT: unknown };
  };
};
declare global {
  interface Window {
    kakao?: KakaoNS;
  }
}

const SDK = "https://dapi.kakao.com/v2/maps/sdk.js";
const LOAD_TIMEOUT_MS = 8000;
let loading: Promise<KakaoNS> | null = null;

/** SDK를 한 번만 불러온다. 실패하면 다음 시도를 위해 비운다 */
function loadKakao(): Promise<KakaoNS> {
  if (loading) return loading;
  loading = new Promise<KakaoNS>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("kakao sdk timeout")), LOAD_TIMEOUT_MS);
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      fn();
    };
    const s = document.createElement("script");
    s.src = `${SDK}?${new URLSearchParams({ appkey: KAKAO_MAP_KEY, autoload: "false" }).toString()}`;
    s.async = true;
    s.onerror = () => done(() => reject(new Error("kakao sdk load error")));
    s.onload = () => {
      const k = window.kakao;
      if (!k?.maps?.load) return done(() => reject(new Error("kakao sdk not ready")));
      k.maps.load(() => done(() => resolve(k)));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

function pinButton(name: string, id: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "smpin smpin--kakao";
  b.dataset.id = id;
  b.setAttribute("aria-label", `${name} 영수증 열기`);
  b.setAttribute("aria-pressed", "false");
  b.title = name;
  b.innerHTML = '<span class="smpin__dot"></span>';
  b.addEventListener("click", onClick);
  return b;
}

export default function StoreMapKakao({ stores, selectedId, onSelect, me, onFail }: Omit<StoreMapProps, "height"> & { onFail: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const kRef = useRef<KakaoNS | null>(null);
  const mapRef = useRef<KMap | null>(null);
  const pinsRef = useRef<Map<string, { ov: KOverlay; el: HTMLButtonElement; pos: KLatLng }>>(new Map());
  const meRef = useRef<{ ov: KOverlay; pos: KLatLng } | null>(null);
  const onSelectRef = useRef(onSelect);
  const failRef = useRef(onFail);
  const userMovedRef = useRef(false);
  // 지도가 준비되면 올려서 핀, 내 위치, 선택 효과를 다시 돌린다.
  const [readyTick, setReadyTick] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
    failRef.current = onFail;
  }, [onSelect, onFail]);

  const fit = () => {
    const k = kRef.current;
    const map = mapRef.current;
    const box = boxRef.current;
    if (!k || !map || !box || box.clientWidth === 0 || box.clientHeight === 0) return false;
    const b = new k.maps.LatLngBounds();
    for (const p of pinsRef.current.values()) b.extend(p.pos);
    if (meRef.current) b.extend(meRef.current.pos);
    if (b.isEmpty()) return false;
    map.setBounds(b, 28, 28, 28, 28);
    return true;
  };

  // SDK를 불러와 지도를 한 번 만든다.
  useEffect(() => {
    let alive = true;
    const box = boxRef.current;
    if (!box) return;
    loadKakao()
      .then((k) => {
        if (!alive) return;
        kRef.current = k;
        const map = new k.maps.Map(box, { center: new k.maps.LatLng(37.5665, 126.978), level: 6 });
        map.addControl(new k.maps.ZoomControl(), k.maps.ControlPosition.RIGHT);
        mapRef.current = map;
        setReadyTick((v) => v + 1);
      })
      .catch(() => {
        if (alive) failRef.current();
      });
    const touched = () => {
      userMovedRef.current = true;
    };
    box.addEventListener("pointerdown", touched);
    box.addEventListener("wheel", touched, { passive: true });
    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return;
      mapRef.current.relayout();
      if (!userMovedRef.current) fit();
    });
    ro.observe(box);
    const pins = pinsRef.current;
    return () => {
      alive = false;
      ro.disconnect();
      box.removeEventListener("pointerdown", touched);
      box.removeEventListener("wheel", touched);
      for (const p of pins.values()) p.ov.setMap(null);
      pins.clear();
      meRef.current?.ov.setMap(null);
      mapRef.current = null;
    };
  }, []);

  // 핀은 매장 id 집합이 바뀔 때만 다시 그린다.
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
      const el = pinButton(displayName(s.name), s.id, () => onSelectRef.current(s.id));
      const ov = new k.maps.CustomOverlay({ position: pos, content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 1, clickable: true, map });
      pinsRef.current.set(s.id, { ov, el, pos });
    }
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, readyTick]);

  // 내 위치
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
      el.setAttribute("aria-label", "내 위치");
      el.innerHTML = '<span class="smme__dot"></span>';
      const pos = new k.maps.LatLng(me.lat, me.lng);
      meRef.current = { ov: new k.maps.CustomOverlay({ position: pos, content: el, zIndex: 20, map }), pos };
    }
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, readyTick]);

  // 선택 표시(색과 테두리), 화면 밖이면 그 핀으로 옮긴다.
  useEffect(() => {
    const map = mapRef.current;
    for (const [id, p] of pinsRef.current) {
      const on = id === selectedId;
      p.el.classList.toggle("is-selected", on);
      p.el.setAttribute("aria-pressed", on ? "true" : "false");
      p.ov.setZIndex(on ? 10 : 1);
      if (on && map && !map.getBounds().contain(p.pos)) map.panTo(p.pos);
    }
  }, [selectedId, idsKey, readyTick]);

  return (
    <div className="storemap__wrap">
      <div ref={boxRef} className="storemap__frame" role="region" aria-label="매장 지도" />
      <button
        type="button"
        className="storemap__fit"
        onClick={() => {
          userMovedRef.current = false;
          fit();
        }}
      >
        상권 전체 보기
      </button>
      {NOMINATIM_ON ? <p className="storemap__credit">{GEOCODE_CREDIT}</p> : null}
    </div>
  );
}
