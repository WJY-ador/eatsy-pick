"use client";

import { DAYS, type PeakGrid, heatStep } from "@/lib/analytics";
import s from "./analysis.module.css";

/**
 * 요일 × 시간대 하이라이트 표. 숫자는 그 조합이 대표 피크인 매장 수다.
 * 색(--color-data-1~5)과 숫자를 같이 쓴다. 선택(강조)은 두꺼운 테두리 + 굵기 + 밑줄로 한 번 더 구분한다.
 * onPick이 있으면 셀이 버튼(상권 분석 필터), 없으면 읽기 전용 셀(근거 차트)이다.
 */
export function PeakTable({
  grid,
  selected,
  onPick,
  caption,
}: {
  grid: PeakGrid;
  selected: string | null;
  onPick?: (key: string) => void;
  caption?: string;
}) {
  if (grid.times.length === 0) return <p className={s.empty}>대표 피크 정보가 있는 매장이 없습니다.</p>;
  return (
    <>
      <table className={`${s.heat} ${onPick ? "" : s.heatStatic}`}>
        <caption className={s.srOnly}>
          {caption ?? "요일과 시간대별 대표 피크 매장 수. 셀을 누르면 그 조합으로 거릅니다."}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={s.rowHead}>
              <span className={s.srOnly}>시간대</span>
            </th>
            {DAYS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.times.map((t) => (
            <tr key={t}>
              <th scope="row" className={s.rowHead}>
                {t}
              </th>
              {DAYS.map((d) => {
                const key = `${d}-${t}`;
                const n = grid.cells[key] ?? 0;
                const pressed = selected === key;
                if (!onPick) {
                  return (
                    <td key={key}>
                      <span
                        className={s.cellStatic}
                        data-step={heatStep(n, grid.max)}
                        data-peak={key}
                        data-count={n}
                        data-mine={pressed}
                        aria-label={`${d}요일 ${t}, 대표 피크 ${n}곳${pressed ? ", 이 매장" : ""}`}
                      >
                        {n > 0 ? n : ""}
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={key}>
                    <button
                      type="button"
                      className={s.cell}
                      data-step={heatStep(n, grid.max)}
                      data-peak={key}
                      data-count={n}
                      aria-pressed={pressed}
                      aria-label={`${d}요일 ${t}, 대표 피크 ${n}곳${pressed ? ", 선택됨" : ""}`}
                      disabled={n === 0 && !pressed}
                      onClick={() => onPick(key)}
                    >
                      {n > 0 ? n : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={s.legend}>
        <span>적음</span>
        <span className={s.swatches} aria-hidden="true">
          <span className={s.swatch} />
          <span className={s.swatch} />
          <span className={s.swatch} />
          <span className={s.swatch} />
          <span className={s.swatch} />
        </span>
        <span>많음, 최대 {grid.max}곳</span>
        {onPick && grid.missing > 0 ? <span>, 피크 정보 없음 {grid.missing}곳 제외</span> : null}
      </div>
    </>
  );
}
