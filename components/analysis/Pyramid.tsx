"use client";

import type { CSSProperties } from "react";
import { AGE_BANDS, type Pyramid, type PyramidCell, c1Label, cellKey, cellOf } from "@/lib/analytics";
import { displayName } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import s from "./analysis.module.css";

/**
 * 손님 피라미드. 가운데 연령대 축, 왼쪽 남성, 오른쪽 여성. 칸 수는 그 연령대와 성별이 1위 고객층(rk01)인 매장 수다.
 * 남녀 막대는 같은 최댓값으로 길이를 정한다. 0인 칸은 비워 둔다(고른 칸이면 해제할 수 있게 버튼을 남긴다).
 * 칸을 누르면 c1 조건을 걸고 다시 누르면 푼다. 칸 아래 매출 상위 매장 이름을 누르면 onOpen(같은 화면의 영수증).
 */
export function PyramidChart({
  data,
  selected,
  onPick,
  onOpen,
}: {
  data: Pyramid;
  /** 지금 걸린 c1 값(칸 키나 옛 주소의 rk01 원문) */
  selected: string | null;
  onPick: (key: string) => void;
  onOpen: (store: Store, el: HTMLElement) => void;
}) {
  if (data.den === 0) return <p className={s.empty}>1위 고객층 정보가 있는 매장이 없습니다.</p>;
  const sel = selected ? cellOf(selected) : null;
  const pressedKey = sel ? cellKey(sel.band, sel.gender) : null;
  const rows = [...data.rows].reverse();
  return (
    <div className={`${s.pyramid} ${pressedKey ? s.pyrDim : ""}`} data-testid="pyramid" data-den={data.den} data-unread={data.unread} data-max={data.max}>
      <div className={s.pyrHead} aria-hidden="true">
        <span>남성</span>
        <span />
        <span>여성</span>
      </div>
      {rows.map(([m, f]) => (
        <div key={m.band} className={s.pyrRow} role="group" aria-label={AGE_BANDS[m.band].label}>
          <Cell cell={m} side="left" max={data.max} pressed={pressedKey === m.key} onPick={onPick} onOpen={onOpen} />
          <span className={s.pyrAge}>{AGE_BANDS[m.band].label}</span>
          <Cell cell={f} side="right" max={data.max} pressed={pressedKey === f.key} onPick={onPick} onOpen={onOpen} />
        </div>
      ))}
      {data.unread > 0 ? <p className={s.pyrNote}>연령대를 읽지 못한 1위 고객층 {data.unread}곳은 칸에서 빠집니다.</p> : null}
    </div>
  );
}

function Cell({
  cell,
  side,
  max,
  pressed,
  onPick,
  onOpen,
}: {
  cell: PyramidCell;
  side: "left" | "right";
  max: number;
  pressed: boolean;
  onPick: (key: string) => void;
  onOpen: (store: Store, el: HTMLElement) => void;
}) {
  const label = c1Label(cell.key);
  return (
    <div
      className={s.pyrCell}
      data-side={side}
      data-testid="pyramid-cell"
      data-age={AGE_BANDS[cell.band].key}
      data-gender={cell.gender}
      data-count={cell.count}
      data-pressed={pressed}
    >
      {cell.count > 0 || pressed ? (
        <button
          type="button"
          className={s.pyrBar}
          aria-pressed={pressed}
          aria-label={`${label}이 1위인 가게 ${cell.count}곳`}
          onClick={() => onPick(cell.key)}
        >
          <span className={s.pyrTrack} aria-hidden="true">
            <span className={s.pyrFill} style={{ "--w": max > 0 ? cell.count / max : 0 } as CSSProperties} />
            <span className={`${s.pyrNum} ${s.num}`}>{cell.count}</span>
          </span>
        </button>
      ) : null}
      {cell.top.length > 0 ? (
        <ul className={s.pyrStores} aria-label={`${label} 1위 매출 상위 가게`}>
          {cell.top.map((st) => (
            <li key={st.id}>
              <button
                type="button"
                className={s.pyrStore}
                data-testid="pyramid-store"
                data-store-id={st.id}
                aria-label={`${displayName(st.name)} 영수증 열기`}
                onClick={(e) => onOpen(st, e.currentTarget)}
              >
                {displayName(st.name)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
