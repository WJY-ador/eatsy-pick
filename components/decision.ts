import { type Decision, decide } from "@/lib/decide";
import { type DecideInput, toSearch } from "@/lib/query";

// 같은 조건의 결정을 15초 동안 한 번만 계산한다(이 서버 인스턴스 안).
// generateMetadata, 결과 화면, /og가 같은 조건을 잇달아 부를 때 프록시 호출이 겹치지 않게 한다.
// 성공 응답은 fetch 캐시가 이미 1800초 잡지만, 실패(429 등)는 캐시되지 않아 이 묶음이 없으면 요청 하나에 두 배로 나간다.
const WINDOW_MS = 15_000;
const recent = new Map<string, { at: number; p: Promise<Decision> }>();

export function getDecision(input: DecideInput): Promise<Decision> {
  const key = toSearch(input);
  // Date.now()는 Cache Components 렌더에서 막힌다. 경과 시간만 재면 되므로 performance.now()를 쓴다.
  const now = performance.now();
  const hit = recent.get(key);
  if (hit && now - hit.at < WINDOW_MS) return hit.p;
  const p = decide(input);
  recent.set(key, { at: now, p });
  if (recent.size > 200) for (const [k, v] of recent) if (now - v.at >= WINDOW_MS) recent.delete(k);
  return p;
}
