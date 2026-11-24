// 이 동네 결제 브리핑 집계. 순수 함수다(서버와 클라이언트가 같이 쓴다).
// 고객층은 원본 rk01(customer1)이 있는 매장만 센다. rk02를 1위로 올리지 않는다.

import type { Store } from "./stores";
import { customer1Label } from "./themes";

export type Briefing = {
  /** 분석 대상 매장 수(넘겨받은 후보 전체) */
  analyzed: number;
  /** 고객층 1위가 확인된 매장 수(고객층 집계의 분모) */
  customerKnown: number;
  /** 고객층 1위에 가장 많이 나온 고객층. 확인된 매장이 없으면 null */
  topCustomer: { label: string; count: number } | null;
};

export function briefingOf(stores: Store[]): Briefing {
  const counts = new Map<string, number>();
  let customerKnown = 0;
  for (const s of stores) {
    const label = customer1Label(s);
    if (!label) continue;
    customerKnown++;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let topCustomer: Briefing["topCustomer"] = null;
  // 같은 수면 먼저 나온 고객층(매출 상위 순으로 먼저 나온 쪽)을 남긴다.
  for (const [label, count] of counts) {
    if (!topCustomer || count > topCustomer.count) topCustomer = { label, count };
  }
  return { analyzed: stores.length, customerKnown, topCustomer };
}
