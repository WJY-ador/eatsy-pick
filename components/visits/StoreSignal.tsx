"use client";

import { type ReactNode, useId } from "react";
import type { Store } from "@/lib/stores";
import { useVisitRecord } from "@/lib/visits";
import { REACTION_LABEL, dayLabel } from "./format";
import s from "./visits.module.css";

/**
 * 다른 사용자 반응 집계 자리. 이번 버전은 값을 넣는 곳이 없다(공유에 동의한 기록을 모을 서버가 없다).
 * 실제 집계가 생기면 again(다시 갈래요를 고른 사람 수), total(그 조건에서 반응을 남긴 사람 수)을 넘긴다.
 */
export type SignalAggregate = { again: number; total: number; occasion?: string };

/** 집계 표시 최소 표본 */
const MIN_AGGREGATE = 5;

function usableAggregate(a: SignalAggregate | undefined, occasion: string | undefined): a is SignalAggregate {
  if (!a) return false;
  if (!Number.isInteger(a.again) || !Number.isInteger(a.total)) return false;
  if (a.total < MIN_AGGREGATE || a.again < 0 || a.again > a.total) return false;
  // 지금 고른 모임 유형과 다른 유형으로 모은 집계는 쓰지 않는다.
  if (occasion && a.occasion && a.occasion !== occasion) return false;
  return true;
}

/**
 * 목록 행 오른쪽의 판단 근거 하나.
 * 내가 "다시 갈래요"를 남긴 매장이면 "내가 다시 갈 곳", 그다음 충분한 집계가 있으면 "다시 갈래요 N/M".
 * 둘 다 없으면 fallback(홈이 넘기는 매장 근거, 예: 회식 적합 표시)을 같은 폭 제한 자리에 그린다.
 * fallback이 없으면 null이다.
 */
export function StoreSignal({
  store,
  occasion,
  aggregate,
  fallback,
}: {
  store: Store;
  occasion?: string;
  aggregate?: SignalAggregate;
  fallback?: ReactNode;
}) {
  const rec = useVisitRecord(store.id);
  if (rec && rec.reaction === "again" && rec.visits.length > 0) {
    return (
      <span className={s.signal}>
        <span className={s.dot} aria-hidden="true" />
        <span className={s.signalText}>내가 다시 갈 곳</span>
      </span>
    );
  }
  if (usableAggregate(aggregate, occasion)) {
    return (
      <span className={s.signal}>
        <span className={s.dot} aria-hidden="true" />
        <span className={s.signalText}>
          다시 갈래요{" "}
          <span className={s.num}>
            {aggregate.again}/{aggregate.total}
          </span>
        </span>
      </span>
    );
  }
  if (fallback === undefined || fallback === null || fallback === false) return null;
  return <span className={s.signalSlot}>{fallback}</span>;
}

/**
 * 영수증 상세의 근거 설명. 별도 버튼 없이 바로 보인다.
 * 내 기록이 없고 쓸 수 있는 집계도 없으면 null이다.
 */
export function StoreSignalDetail({
  store,
  occasion,
  aggregate,
}: {
  store: Store;
  occasion?: string;
  aggregate?: SignalAggregate;
}) {
  const rec = useVisitRecord(store.id);
  const titleId = useId();
  const agg = usableAggregate(aggregate, occasion) ? aggregate : null;
  if (!rec && !agg) return null;
  const visits = rec ? [...rec.visits].sort((a, b) => (a.at < b.at ? 1 : -1)) : [];

  return (
    <div className={s.detail}>
      {rec ? (
        <section aria-labelledby={titleId}>
          <h3 className={s.detailTitle} id={titleId}>
            내가 남긴 방문 기록
          </h3>
          {visits.length === 0 ? (
            <p className={s.detailLine}>저장만 했습니다. 방문 기록은 없습니다.</p>
          ) : (
            <>
              <ul className={s.detailList}>
                {visits.map((v, i) => (
                  <li key={`${v.at}-${i}`}>
                    {dayLabel(v.at)} 방문{v.occasion ? `, ${v.occasion}` : ""}
                  </li>
                ))}
              </ul>
              <p className={s.detailLine}>
                재방문 의향: {rec.reaction ? REACTION_LABEL[rec.reaction] : "남기지 않음"}
              </p>
            </>
          )}
          <p className={s.note}>기록은 이 기기에만 저장됩니다.</p>
        </section>
      ) : null}
      {agg ? (
        <section>
          <h3 className={s.detailTitle}>비슷한 약속에서의 반응</h3>
          <p className={s.detailLine}>
            {agg.occasion ? `${agg.occasion} 모임에서 ` : ""}방문 후 반응을 남긴{" "}
            <span className={s.num}>{agg.total}</span>명 중 <span className={s.num}>{agg.again}</span>명이 다시
            갈래요를 골랐습니다.
          </p>
        </section>
      ) : null}
    </div>
  );
}
