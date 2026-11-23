// API 좌표(xaxsVal/yaxsVal, TM128) ↔ WGS84.
// 정의 검증(2026-11-23): 강남역 중심 (314276, 544442) → 37.498162, 127.028306, 기준점(37.498, 127.028)에서 32m.
// towgs84 없이는 363m 어긋났다.

import proj4 from "proj4";

export const TM128 =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";

/** TM128 미터 좌표 → [위도, 경도]. 값이 없거나 0이면 null */
export function tmToLatLng(x: unknown, y: unknown): [number, number] | null {
  const xx = Number(x);
  const yy = Number(y);
  if (!Number.isFinite(xx) || !Number.isFinite(yy) || xx === 0 || yy === 0) return null;
  const [lng, lat] = proj4(TM128, "EPSG:4326", [xx, yy]);
  return [lat, lng];
}

/** [위도, 경도] → TM128 미터 좌표 */
export function latLngToTm(lat: number, lng: number): { x: number; y: number } {
  const [x, y] = proj4("EPSG:4326", TM128, [lng, lat]);
  return { x, y };
}

/** 한국 근처 좌표인지(입력 검증용) */
export function isKoreanLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132;
}
