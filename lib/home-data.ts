// 서버 page가 홈 화면에 넘기는 데이터 계약. page.tsx와 HomeView가 여기서 import한다(타입만).

import type { PresetPoint } from "./geocode";
import type { HomeQuery } from "./home-params";
import type { AreaDataset, Store } from "./stores";

/**
 * 가게 이름 검색 결과. scopeTitle은 범위 안 이름 검색(머리말에서 지금 지역과 함께 보낸 메뉴, 가게 이름)일 때만 그 범위 이름이다(강남역).
 * 전국 이름 검색과 지역으로 풀린 낱말의 보조 검색에는 없다. 화면은 이 값으로 피드 위 검색 자리와 보조 섹션을 가른다.
 */
export type SearchState = { status: "ok" | "empty" | "error"; query: string; stores: Store[]; scopeTitle?: string };

/** 카카오 장소 검색으로 찾은 기준점(역 등). 공개 장소 좌표라 화면에 써도 된다 */
export type PlaceHit = { name: string; lat: number; lng: number; address: string };

/**
 * dataset.center: 프리셋이면 프리셋 중심, 장소 검색이면 그 장소 좌표, 그 밖은 null(클라이언트가 조회 결과 중심을 쓴다)
 */
export type HomeData = { query: HomeQuery; dataset: AreaDataset | null; search: SearchState | null; presets: PresetPoint[]; place: PlaceHit | null };
