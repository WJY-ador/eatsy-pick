// 서버 page가 홈 화면에 넘기는 데이터 계약. page.tsx와 HomeView가 여기서 import한다(타입만).

import type { PresetPoint } from "./geocode";
import type { HomeQuery } from "./home-params";
import type { AreaDataset, Store } from "./stores";

export type SearchState = { status: "ok" | "empty" | "error"; query: string; stores: Store[] };

/** 카카오 장소 검색으로 찾은 기준점(역 등). 공개 장소 좌표라 화면에 써도 된다 */
export type PlaceHit = { name: string; lat: number; lng: number; address: string };

/**
 * dataset.center: 프리셋이면 프리셋 중심, 장소 검색이면 그 장소 좌표, 그 밖은 null(클라이언트가 조회 결과 중심을 쓴다)
 */
export type HomeData = { query: HomeQuery; dataset: AreaDataset | null; search: SearchState | null; presets: PresetPoint[]; place: PlaceHit | null };
