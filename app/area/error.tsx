"use client";

/** 상권 리포트 오류 경계. 조회가 하나라도 실패하면 여기로 온다(실패 화면이 캐시에 남지 않게). */
export default function AreaError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main id="main" className="report container">
      <div className="state state--error" role="alert">
        <h1 className="state__h">결제 데이터를 불러오지 못했습니다.</h1>
        <p>잇플 조회가 일부 실패했거나 한꺼번에 몰렸습니다. 1분쯤 지나 다시 시도해 주세요.</p>
        <button type="button" className="btn btn--primary" onClick={() => retry()}>
          다시 시도
        </button>
      </div>
    </main>
  );
}
