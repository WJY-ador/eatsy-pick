"use client";

import s from "@/components/analysis/analysis.module.css";

/** 상권 분석 오류 경계. 조회가 전부 실패하면 여기로 온다. 빈 결과(0곳)와 다른 화면이다. */
export default function AnalysisError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main id="main" className={s.page}>
      <div className={s.inner}>
        <section className={s.panel} role="alert">
          <h1 className={s.h1}>결제 데이터를 불러오지 못했습니다</h1>
          <p className={s.empty}>잇플 조회가 실패했거나 한꺼번에 몰렸습니다. 1분쯤 지나 다시 시도해 주세요.</p>
          <div className={s.controls}>
            <button type="button" className={`${s.btn} ${s.btnStrong}`} onClick={() => retry()}>
              다시 시도
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
