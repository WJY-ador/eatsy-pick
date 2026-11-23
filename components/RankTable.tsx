import { displayName } from "@/lib/format";
import { customerLabel, peakLabel, topPercent } from "@/lib/labels";
import type { Row } from "@/lib/report";
import { ATTRIBUTION } from "@/lib/site";
import { MerLink } from "./MerLink";

/** 결제 랭킹 표. 행은 hairline으로 나누고, 모바일에서는 행을 세로로 접는다(가로 스크롤 없음). */
export function RankTable({ rows, caption }: { rows: Row[]; caption: string }) {
  return (
    <div className="rank-wrap">
      <table className="rank">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">가게</th>
            <th scope="col">업종</th>
            <th scope="col">시군구 매출</th>
            <th scope="col">피크</th>
            <th scope="col">고객층</th>
            <th scope="col">
              <span className="visually-hidden">잇플 링크</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rk01 = r.item.vistCstmrRnkList?.rk01;
            return (
              <tr key={`${i}-${r.item.merNm}`}>
                <td className="rank__no num" data-label="순위">
                  {i + 1}
                </td>
                <th scope="row" className="rank__name" data-label="가게">
                  {displayName(r.item.merNm)}
                </th>
                <td data-label="업종">{r.item.merTpbuzNm}</td>
                <td className="rank__pct num">
                  {r.sigungu} 상위 {topPercent(r.item.ccgSaleRnk)}%
                </td>
                <td>{(() => {
                  const p = peakLabel(r.item.congestionDwk, r.item.congestionTizn);
                  return p ? `${p} 피크` : "정보 없음";
                })()}</td>
                <td>{rk01 ? `${customerLabel(rk01)} 1위` : "정보 없음"}</td>
                <td className="rank__go-cell">
                  <MerLink merUrl={r.item.merUrl} className="rank__go" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="rank__attr">{ATTRIBUTION}</p>
    </div>
  );
}
