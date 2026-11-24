"use client";

import { NavLink } from "@/components/NavLink";
import type { Briefing as BriefingData } from "@/lib/briefing";

/**
 * 이 동네 결제 브리핑. 카드 하나짜리 짧은 배너다.
 * 수와 고객층은 지금 후보(지역 조회 결과에 프랜차이즈 제외를 적용한 것)에서 계산한다. 비율은 만들지 않고 수로만 적는다.
 */
export function Briefing({
  region,
  example,
  data,
  exclude,
  mapNote,
  analysisHref,
}: {
  region: string;
  /** 조건 없는 첫 진입의 예시 지역 */
  example: boolean;
  data: BriefingData;
  exclude: boolean;
  /** 분석 대상 수와 지도, 목록에 보이는 수가 다를 때 무슨 수인지 적은 한 줄 */
  mapNote: string | null;
  analysisHref: string;
}) {
  const top = data.topCustomer;
  return (
    <section className="brief" data-testid="briefing" aria-labelledby="brief-h">
      <div className="brief__body">
        <h2 id="brief-h" className="brief__k">
          이 동네 결제 브리핑{example ? <span className="brief__ex">예시 지역</span> : null}
        </h2>
        <p className="brief__main">
          <strong className="brief__region">{region}</strong>
          <span>
            분석 대상 <strong className="num">{data.analyzed}곳</strong>
            {exclude ? <span className="brief__scope">, 프랜차이즈 제외</span> : null}
          </span>
        </p>
        <p className="brief__cust">
          {top ? (
            <>
              주 결제 고객층 1위로 가장 많이 나온 고객층은 <strong>{top.label}</strong>입니다.{" "}
              <span className="brief__base num">
                고객층이 확인된 {data.customerKnown}곳 중 {top.count}곳
              </span>
            </>
          ) : (
            "주 결제 고객층 1위가 확인된 매장이 없습니다."
          )}
        </p>
        {mapNote ? <p className="brief__note">{mapNote}</p> : null}
      </div>
      <NavLink href={analysisHref} className="brief__go">
        상권 분석 자세히 보기
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </NavLink>
    </section>
  );
}
