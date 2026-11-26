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

const HOLD_NOTE = "보류한 곳은 저장 패턴과 추천에 쓰지 않아요.";

/** 백분위 평균: 소수 둘째 자리까지, 끝의 0은 뗀다 */
function pctLabel(v: number): string {
  return `${Number(v.toFixed(2))}%`;
}

/** 1024px 아래 칩 줄 밑에 보이는 저장 패턴 한 줄. 넘치면 말줄임이라 중요한 값부터 두 개까지 쓴다 */
function summaryLine(t: ReturnType<typeof tasteSummary>): string {
  const parts: string[] = [];
  if (t.avgRank) parts.push(`지역 매출 평균 상위 ${pctLabel(t.avgRank.value)}`);
  if (t.topCategory) parts.push(`주 업종 ${t.topCategory.label}`);
  if (parts.length < 2 && t.topCustomer) parts.push(`주 고객층 ${t.topCustomer.label}`);
  return parts.join(", ");
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 홈의 내 저장 요약. 지도와 전체 매장 아래, 큐레이션 위에 둔다. 1024px 이상은 테두리 있는 띠 하나(첫 줄 단계별 수, 둘째 줄 저장 패턴), 그 아래 폭은 칩 줄과 요약 한 줄이다.
 * 단계별 수를 누르면 내 저장이 그 단계 필터로 열린다. 저장 패턴은 내가 저장한 매장의 BC카드 특성이다(개인 결제 내역이 아니다).
 * 기기 저장 데이터라 서버 렌더에는 빈 칸만 둔다. 1024px 아래는 가로로 미는 칩 줄과 그 아래 요약 한 줄이며, 수화 전, 저장 0곳, 보류만, 패턴 있음
 * 어느 상태든 같은 높이로 고정한다(feed.css). 1024px 이상도 두 줄 높이로 고정하고 넘치는 패턴은 오른쪽 끝을 흐린다.
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
      <div className="taste__row">
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
      </div>
      <p className="taste__sum">{t.basis === 0 ? HOLD_NOTE : summaryLine(t)}</p>
      {t.basis === 0 ? (
        <p className="taste__note">{HOLD_NOTE}</p>
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
