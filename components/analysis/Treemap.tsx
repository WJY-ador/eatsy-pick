"use client";

import { useId, useState } from "react";
import { type Bar, planTreemap, squarify } from "@/lib/analytics";
import s from "./analysis.module.css";

/** 그림 상자 가로 ÷ 세로. CSS aspect-ratio와 같아야 블록 면적이 매장 수에 비례한다 */
const RATIO = 3 / 2;
const REST = "\u0000rest";

/**
 * 업종 트리맵. 블록 면적이 그 업종 매장 수에 비례한다. 블록을 누르면 업종(cat) 조건을 걸고 다시 누르면 푼다.
 * 작은 업종은 "그 밖 N개 업종" 블록 하나로 묶고, 누르면 아래에 목록으로 펼친다. 이름은 원본 업종 그대로 쓰고, 좁은 블록은 말줄임한다.
 */
export function Treemap({ bars, selected, onPick }: { bars: Bar[]; selected: string | null; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const plan = planTreemap(bars, selected);
  const restSum = plan.rest.reduce((a, b) => a + b.count, 0);
  const items = plan.rest.length > 0 ? [...plan.blocks, { key: REST, count: restSum }] : plan.blocks;
  const rects = squarify(items, RATIO);
  if (rects.length === 0) return <p className={s.empty}>보여 줄 업종이 없습니다.</p>;
  return (
    <div data-testid="treemap" data-total={items.reduce((a, b) => a + b.count, 0)}>
      <div className={`${s.treemap} ${selected ? s.tmDim : ""}`}>
        {rects.map((r) => {
          const style = { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` };
          // 낮거나 좁은 블록은 이름과 수를 한 줄에 줄여 쓴다(접근 이름은 전체)
          const size = r.h < 16 || r.w < 16 ? "s" : "m";
          if (r.key === REST) {
            return (
              <button
                key={r.key}
                type="button"
                className={`${s.tmBlock} ${s.tmRest}`}
                style={style}
                data-size={size}
                data-testid="treemap-more"
                data-count={r.count}
                aria-expanded={open}
                aria-controls={listId}
                aria-label={`그 밖 ${plan.rest.length}개 업종 매장 ${r.count}곳`}
                onClick={() => setOpen((v) => !v)}
              >
                <span className={s.tmName}>그 밖 {plan.rest.length}개 업종</span>
                <span className={`${s.tmCount} ${s.num}`}>{r.count}</span>
              </button>
            );
          }
          const pressed = selected === r.key;
          return (
            <button
              key={r.key}
              type="button"
              className={s.tmBlock}
              style={style}
              data-size={size}
              data-testid="treemap-block"
              data-cat={r.key}
              data-count={r.count}
              aria-pressed={pressed}
              aria-label={`${r.key} 매장 ${r.count}곳`}
              onClick={() => onPick(r.key)}
            >
              <span className={s.tmName}>{r.key}</span>
              <span className={`${s.tmCount} ${s.num}`}>{r.count}</span>
            </button>
          );
        })}
      </div>
      {plan.rest.length > 0 ? (
        <ul id={listId} className={s.tmList} hidden={!open} data-testid="treemap-rest-list">
          {plan.rest.map((b) => (
            <li key={b.key}>
              <button
                type="button"
                className={s.tmItem}
                data-testid="treemap-rest"
                data-cat={b.key}
                data-count={b.count}
                aria-pressed={false}
                onClick={() => onPick(b.key)}
              >
                <span>{b.key}</span>
                <span className={s.num}>{b.count}곳</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
