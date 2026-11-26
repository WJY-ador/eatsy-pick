import { CategoryImage } from "@/components/home/CategoryImage";
import { DAYS, TIMES } from "@/lib/analytics";
import { displayName } from "@/lib/format";
import { customerLabel, peakLabel } from "@/lib/labels";
import { percentLabel } from "@/lib/store-view";
import type { Row } from "@/lib/report";
import { ATTRIBUTION } from "@/lib/site";
import { MerLink } from "./MerLink";

/**
 * 결제 랭킹 목록. 순위 순서 그대로 ol/li 카드형 행으로 그린다(가로 스크롤 없음, 넓은 화면은 2열).
 * 행: 순위 숫자, 업종 참고 이미지 썸네일, 가게명과 업종, 시군구 매출 상위 N% 게이지, 대표 피크 띠, 고객층 1위 칩, 잇플 링크.
 * 게이지는 aria-hidden이고 옆 글자가 같은 값을 낸다. 피크 띠는 role="img" + aria-label로 읽는다.
 * 참고 이미지 안내 한 줄과 대표 피크 뜻은 페이지에 한 번만 둔다(ReportViews RankNote).
 */
export function RankTable({ rows, caption }: { rows: Row[]; caption: string }) {
  return (
    <div className="rank-wrap">
      {/* list-style: none이면 Safari가 목록 역할을 버리므로 role="list"를 둔다 */}
      <ol className="rank" role="list" aria-label={caption}>
        {rows.map((r, i) => (
          <RankItem key={`${i}-${r.item.merNm}`} r={r} no={i + 1} />
        ))}
      </ol>
      <p className="rank__attr">{ATTRIBUTION}</p>
    </div>
  );
}

function RankItem({ r, no }: { r: Row; no: number }) {
  const it = r.item;
  const name = displayName(it.merNm);
  const rk01 = it.vistCstmrRnkList?.rk01;
  return (
    <li className="rank__item">
      <span className="rank__no num">
        {no}
        <span className="visually-hidden">위</span>
      </span>
      <CategoryImage name={it.merNm} category={it.merTpbuzNm} className="rank__thumb" sizes="88px" />
      <div className="rank__head">
        <h3 className="rank__name">{name}</h3>
        {it.merTpbuzNm ? <p className="rank__cat">{it.merTpbuzNm}</p> : null}
      </div>
      <div className="rank__body">
        <SalesGauge sigungu={r.sigungu} value={it.ccgSaleRnk} />
        <PeakStrips day={it.congestionDwk} time={it.congestionTizn} />
        <div className="rank__foot">
          <p className="rank__cust">
            <span className="rank__k">고객층 1위</span>
            {rk01 ? <span className="rank__chip">{customerLabel(rk01)}</span> : <span className="rank__none">정보 없음</span>}
          </p>
          <MerLink merUrl={it.merUrl} className="rank__go" />
        </div>
      </div>
    </li>
  );
}

/** 시군구 매출 상위 N%: 글자는 원본 값 그대로(percentLabel). 게이지는 0~100% 선형 눈금에서 값 위치를 점으로 찍고 왼쪽 끝을 상위로 둔다 */
function SalesGauge({ sigungu, value }: { sigungu: string; value: number | null | undefined }) {
  const where = sigungu || "시군구";
  const ok = typeof value === "number" && Number.isFinite(value);
  if (!ok) {
    return (
      <p className="rank__pct-text">
        {where} 매출 순위 <span className="rank__none">정보 없음</span>
      </p>
    );
  }
  const pos = Math.min(100, Math.max(0, value));
  return (
    <div className="rank__pct">
      <p className="rank__pct-text">
        {where} 매출 <strong className="num">상위 {percentLabel(value)}</strong>
      </p>
      <div className="rank-gauge" aria-hidden="true">
        <span className="rank-gauge__end">상위</span>
        <span className="rank-gauge__track">
          <span className="rank-gauge__dot" style={{ left: `${pos}%` }} />
        </span>
        <span className="rank-gauge__end">하위</span>
      </div>
    </div>
  );
}

/**
 * 대표 피크 요일 7칸 띠와 시간대 6칸 띠. 순서는 lib/analytics DAYS, TIMES. 칸에는 API 라벨만 쓴다.
 * 값이 띠 목록에 없으면 띠 대신 그 글자를, 값이 비면 정보 없음을 낸다.
 */
function PeakStrips({ day, time }: { day?: string; time?: string }) {
  const label = peakLabel(day, time);
  if (!label) {
    return (
      <p className="rank__peak-text">
        <span className="rank__k">대표 피크</span> <span className="rank__none">정보 없음</span>
      </p>
    );
  }
  const dayOk = !!day && (DAYS as readonly string[]).includes(day);
  const timeOk = !!time && (TIMES as readonly string[]).includes(time);
  if (!dayOk && !timeOk) {
    return (
      <p className="rank__peak-text">
        <span className="rank__k">대표 피크</span> {label}
      </p>
    );
  }
  return (
    <div className="rank__peak" role="img" aria-label={`대표 피크 ${label}`}>
      <span className="rank__k">대표 피크</span>
      {dayOk ? <Strip cells={DAYS} on={day} /> : <span className={day ? undefined : "rank__none"}>{day ? peakLabel(day) : "요일 정보 없음"}</span>}
      {timeOk ? <Strip cells={TIMES} on={time} /> : <span className={time ? undefined : "rank__none"}>{time ?? "시간대 정보 없음"}</span>}
    </div>
  );
}

function Strip({ cells, on }: { cells: readonly string[]; on: string | undefined }) {
  return (
    <span className="rank-strip" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((c) => (
        <span key={c} className="rank-strip__cell" data-on={c === on ? "true" : undefined}>
          {c}
        </span>
      ))}
    </span>
  );
}
