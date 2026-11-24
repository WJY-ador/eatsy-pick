// 전체 테마 큐레이션의 섹션 배정. 순수 함수다(화면 폭과 무관해 PC와 모바일이 같은 카드를 받는다).
// 규칙: SECTION_ORDER 순서로 채운다. 앞 섹션이 실제로 카드로 내보낸(최대 max장) 매장 id는 뒤 섹션에서 빼고,
// 뒤 섹션은 자기 자격을 가진 다음 매장으로 채운다. max를 넘어 카드로 나가지 않은 매장은 배정으로 세지 않는다.
// 각 풀의 입력 순서를 그대로 보존한다. 남은 수가 적으면 그만큼만, 0이면 빈 배열(섹션을 접는다).

import type { Store } from "./stores";

export type SectionId = "top1" | "reco" | "local" | "hoesik";

/** 전체 테마의 노출 순서: 매출 상위 1%, 내 저장 패턴과 비슷한 곳, 동네맛집, 회식 적합 */
export const SECTION_ORDER: SectionId[] = ["top1", "reco", "local", "hoesik"];

export function assignSections(pools: Partial<Record<SectionId, Store[]>>, max: number): Record<SectionId, Store[]> {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  const taken = new Set<string>();
  const out: Record<SectionId, Store[]> = { top1: [], reco: [], local: [], hoesik: [] };
  for (const id of SECTION_ORDER) {
    const picked: Store[] = [];
    for (const s of pools[id] ?? []) {
      if (picked.length >= limit) break;
      // 같은 풀 안에 같은 id가 두 번 와도 한 번만 낸다.
      if (taken.has(s.id)) continue;
      taken.add(s.id);
      picked.push(s);
    }
    out[id] = picked;
  }
  return out;
}
