// 지도 제공자 선택. NEXT_PUBLIC_KAKAO_MAP_KEY(카카오 JavaScript 키)가 있을 때만 카카오 지도를 쓰고,
// 없거나 SDK 로드나 인증이 실패하면 Leaflet + lib/map-tiles.ts 타일로 넘어간다.
// 빌드 시점에 값이 박힌다(NEXT_PUBLIC_ 규칙). 키를 넣거나 빼면 재배포한다.

import { TILE_PROVIDER_NAME } from "./map-tiles";

export const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";
export const MAP_PROVIDER: "kakao" | "leaflet" = KAKAO_MAP_KEY ? "kakao" : "leaflet";
/** 개인정보 안내에 쓰는 지도 제공자 이름 */
export const MAP_PROVIDER_NAME = MAP_PROVIDER === "kakao" ? "카카오" : TILE_PROVIDER_NAME;
