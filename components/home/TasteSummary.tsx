"use client";

import "@/app/feed.css";
import { useMemo, useSyncExternalStore } from "react";
import { tasteSummary } from "@/lib/taste";
import { openSaves } from "@/lib/ui-state";
import { STAGES, useVisits } from "@/lib/visits";

const noop = () => () => {};
/** 서버 렌더와 첫 수화에서는 false, 붙은 뒤 true. 기기 저장 데이터는 true일 때만 화면에 낸다 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** 백분위 평균: 소수 둘째 자리까지, 끝의 0은 뗀다 */
function pctLabel(v: number): string {
  return `${Number(v.toFixed(2))}%`;
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 홈의 내 저장 요약. 1024px 이상은 결제 브리핑 옆 칸, 그 아래 폭은 브리핑 바로 아래 한 줄이다.
 * 단계별 수를 누르면 내 저장이 그 단계 필터로 열린다. 저장 패턴은 내가 저장한 매장의 BC카드 특성이다(개인 결제 내역이 아니다).
 * 기기 저장 데이터라 서버 렌더에는 같은 크기의 빈 칸만 둔다. 칸의 높이는 CSS가 고정해 붙을 때 화면이 뛰지 않는다.
 */
export function TasteSummary() {
  const hydrated = useHydrated();
  const { records } = useVisits();
  const t = useMemo(() => tasteSummary(Object.values(records)), [records]);

  if (!hydrated) return <section className="taste" data-testid="taste-summary" aria-hidden="true" />;

  if (t.saved === 0) {
    return (
      <section className="taste" data-testid="taste-summary" aria-labelledby="taste-h">
        <h2 id="taste-h" className="taste__k">
          내 저장
        </h2>
        <p className="taste__empty">가게를 저장하면 저장 패턴과 비슷한 곳을 볼 수 있어요</p>
      </section>
    );
  }

  const lines: { k: string; v: string; base: string }[] = [];
  if (t.avgRank) lines.push({ k: "지역 매출 백분위 평균", v: `상위 ${pctLabel(t.avgRank.value)}`, base: `${t.avgRank.n}곳 평균` });
  if (t.topCategory) lines.push({ k: "가장 많이 저장한 업종", v: t.topCategory.label, base: `${t.topCategory.count}곳` });
  if (t.topCustomer) lines.push({ k: "주 고객층 1위 최다", v: t.topCustomer.label, base: `고객층이 확인된 ${t.topCustomer.known}곳 중 ${t.topCustomer.count}곳` });

  return (
    <section className="taste" data-testid="taste-summary" aria-labelledby="taste-h">
      <h2 id="taste-h" className="taste__k">
        내 저장
      </h2>
      <button type="button" className="taste__open" aria-haspopup="dialog" aria-label={`내 저장 ${t.saved}곳 보기`} onClick={() => openSaves()}>
        <span className="taste__open-label">내 저장</span>
        <span className="taste__open-all">
          <span className="num">{t.saved}곳</span> 보기
        </span>
        <Chevron />
      </button>
      <div className="taste__stages">
        {STAGES.map((s) => (
          <button key={s.id} type="button" className="taste__stage" data-testid="stage-count" data-stage={s.id} aria-haspopup="dialog" onClick={() => openSaves(s.id)}>
            {s.label} <span className="num">{t.stageCounts[s.id]}</span>
          </button>
        ))}
      </div>
      {t.basis === 0 ? (
        <p className="taste__note">보류한 곳은 저장 패턴과 추천에 쓰지 않아요.</p>
      ) : lines.length > 0 ? (
        <div className="taste__pattern">
          <p className="taste__note">내가 저장한 매장의 BC카드 특성</p>
          <ul className="taste__lines">
            {lines.map((l) => (
              <li key={l.k}>
                {l.k} <strong>{l.v}</strong> <span className="taste__base num">{l.base}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
