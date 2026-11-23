// 카드, 표, OG 이미지가 같이 쓰는 표시 형식. 상호 표시는 lib/store-view.ts displayName 하나로 모은다.
export { displayName } from "./store-view";


export function radiusLabel(r: number | null): string {
  if (r === null) return "반경 제한 없이";
  return r >= 1000 ? `반경 ${(r / 1000).toFixed(1)}km 안에서` : `반경 ${r}m 안에서`;
}

