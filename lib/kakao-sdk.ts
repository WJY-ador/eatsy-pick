"use client";

// 카카오 지도 JS SDK 로더(지도 어댑터 StoreMapKakao와 역지오코딩 kakaoGeocoder가 함께 쓴다). 페이지당 스크립트 한 번.
// 공식 문서(https://apis.map.kakao.com/web/documentation/): 동적 삽입은 autoload=false를 붙이고 kakao.maps.load(callback)에서 쓴다.
// libraries=services는 역지오코딩(services.Geocoder.coord2RegionCode)용이다(2026-11-24). 키는 NEXT_PUBLIC_KAKAO_MAP_KEY(JavaScript 키).
// 등록되지 않은 도메인, 포트에서는 로드나 인증이 실패한다. 지도는 Leaflet으로, 역지오코딩은 Nominatim으로 넘어간다.

import { KAKAO_MAP_KEY } from "./map-provider";

const SDK = "https://dapi.kakao.com/v2/maps/sdk.js";
const LOAD_TIMEOUT_MS = 8000;
let loading: Promise<unknown> | null = null;
let failedOnce = false;

/** SDK를 한 번만 불러온다. 실패하면 다음 시도를 위해 비운다(지도는 다시 시도할 수 있다) */
export function loadKakaoSdk<T>(): Promise<T> {
  if (loading) return loading as Promise<T>;
  loading = new Promise<unknown>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("kakao sdk timeout")), LOAD_TIMEOUT_MS);
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      fn();
    };
    const s = document.createElement("script");
    s.src = `${SDK}?${new URLSearchParams({ appkey: KAKAO_MAP_KEY, autoload: "false", libraries: "services" }).toString()}`;
    s.async = true;
    s.onerror = () => done(() => reject(new Error("kakao sdk load error")));
    s.onload = () => {
      const k = (window as unknown as { kakao?: { maps?: { load?: (cb: () => void) => void } } }).kakao;
      if (!k?.maps?.load) return done(() => reject(new Error("kakao sdk not ready")));
      k.maps.load(() =>
        done(() => {
          failedOnce = false;
          resolve(k);
        }),
      );
    };
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    failedOnce = true;
    throw e;
  });
  return loading as Promise<T>;
}

/** 마지막 SDK 로드가 실패했는가(지도가 다시 불러 성공하면 풀린다). 역지오코딩은 이때 카카오를 건너뛴다(누를 때마다 기다리지 않게) */
export function kakaoSdkFailed(): boolean {
  return failedOnce;
}
