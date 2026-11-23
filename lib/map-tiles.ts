// Leaflet 타일 설정 한 곳. 타일 제공자를 바꿀 때는 이 파일만 고친다.
// 지금 값: OpenStreetMap 표준 타일. 정책 https://operations.osmfoundation.org/policies/tiles/
//   정확한 URL, 보이는 출처 표기, Referer 전송(Referrer-Policy strict-origin-when-cross-origin), 미리 받기 금지.

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
export const TILE_MAX_ZOOM = 19;
/** 밝은 회색 베이스맵을 CSS 필터로 만들지(OSM 표준 타일용). 다른 제공자의 타일에는 끈다 */
export const TILE_GRAYSCALE = true;
/** 개인정보 안내에 쓰는 이 타일의 제공자 이름 */
export const TILE_PROVIDER_NAME = "OpenStreetMap";
