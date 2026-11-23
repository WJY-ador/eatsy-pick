// 카드, 표, OG 이미지가 같이 쓰는 표시 형식.

/** 법인 표기 "(주)", "주식회사", "유한회사"만 뗀다 */
export function displayName(name: string): string {
  return name.replace(/\(주\)|주식회사|유한회사/g, "").replace(/\s+/g, " ").trim() || name;
}

export function distanceLabel(m: number): string {
  if (m >= 1000) return `약 ${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `약 ${Math.max(10, Math.round(m / 10) * 10)}m`;
}

export function radiusLabel(r: number | null): string {
  if (r === null) return "반경 제한 없이";
  return r >= 1000 ? `반경 ${(r / 1000).toFixed(1)}km 안에서` : `반경 ${r}m 안에서`;
}

/** 받침에 따라 "이"/"가" */
export function withSubject(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? "이" : "가"}`;
}
