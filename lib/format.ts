// 카드, 표, OG 이미지가 같이 쓰는 표시 형식.

/** 법인 표기 "(주)", "주식회사", "유한회사"만 뗀다 */
export function displayName(name: string): string {
  return name.replace(/\(주\)|주식회사|유한회사/g, "").replace(/\s+/g, " ").trim() || name;
}

export function radiusLabel(r: number | null): string {
  if (r === null) return "반경 제한 없이";
  return r >= 1000 ? `반경 ${(r / 1000).toFixed(1)}km 안에서` : `반경 ${r}m 안에서`;
}

