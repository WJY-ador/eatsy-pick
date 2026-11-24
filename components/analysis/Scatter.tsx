"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type ScatterGroup, formatRank, groupScatter, scatterPoints } from "@/lib/analytics";
import { displayName } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import s from "./analysis.module.css";

/** 점 표식 지름(px). 묶음 기준도 이 크기로 정해 표식끼리 겹치지 않게 한다 */
const DOT = 18;
/** 처음 그릴 때 가정하는 그림 폭(px). 실제 폭은 ResizeObserver로 다시 잰다 */
const FALLBACK_W = 320;
/** 축 범위(%). 기본은 0~100 전체, 확대는 고정 0~10. 데이터에 따라 범위를 바꾸지 않는다 */
const FULL = 100;
const ZOOM = 10;
type Range = typeof FULL | typeof ZOOM;
/** 두 값이 유효한 점 가운데 이 비율 이상이 0~ZOOM 안에 들면 처음에 확대 범위로 연다. 아니면 전체 범위로 연다 */
const ZOOM_OPEN_SHARE = 0.8;
const TICKS: Record<Range, number[]> = { [FULL]: [0, 25, 50, 75, 100], [ZOOM]: [0, 2.5, 5, 7.5, 10] };

function pointLabel(st: Store, ccg: number, all: number): string {
  return `${displayName(st.name)}, 시군구 매출 상위 ${formatRank(ccg)}, 전국 매출 상위 ${formatRank(all)}`;
}

function groupKey(g: ScatterGroup): string {
  return g.points.map((p) => p.store.id).join(" ");
}

/**
 * 우리 동네와 전국 매출 순위 비교. 가로축 시군구 매출 상위 %(ccgSaleRnk), 세로축 전국 매출 상위 %(allSaleRnk), 둘 다 0~100 고정 축.
 * 작을수록 상위라 왼쪽 위가 두 축 모두 상위다. 두 값이 모두 있는 매장만 그린다.
 * 화면에서 겹치는 점은 하나의 묶음 버튼으로 그리고, 누르면 그 자리의 매장 목록을 펼쳐 하나를 고르게 한다.
 * 점이나 목록의 매장을 고르면 onOpen(매장, 누른 요소)을 부른다(같은 화면의 영수증).
 */
export function Scatter({
  stores,
  selectedId,
  onOpen,
}: {
  stores: Store[];
  selectedId: string | null;
  onOpen: (store: Store, el: HTMLElement) => void;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // 사용자가 고른 범위. 고르기 전에는 점 분포로 정한 처음 범위를 쓴다(지역 이름으로 나누지 않는다).
  const [chosen, setRange] = useState<Range | null>(null);
  const listId = useId();
  const points = useMemo(() => scatterPoints(stores), [stores]);
  const inZoom = points.filter((p) => p.ccg <= ZOOM && p.all <= ZOOM).length;
  const auto: Range = points.length > 0 && inZoom / points.length >= ZOOM_OPEN_SHARE ? ZOOM : FULL;
  const range: Range = chosen ?? auto;
  const inRange = useMemo(() => points.filter((p) => p.ccg <= range && p.all <= range), [points, range]);
  const outside = points.length - inRange.length;
  const ticks = TICKS[range];
  const at = (v: number) => `${(v / range) * 100}%`;

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 그림은 정사각형이라 가로, 세로 기준이 같다. 표식 지름만큼을 값 단위(현재 범위 기준)로 바꿔 묶음 기준으로 쓴다.
  const t = (DOT / Math.max(width, 1)) * range;
  const groups = useMemo(() => groupScatter(inRange, t, t), [inRange, t]);
  const open = openKey ? (groups.find((g) => groupKey(g) === openKey) ?? null) : null;
  const multi = groups.filter((g) => g.points.length > 1);

  return (
    <div
      className={s.scatter}
      data-testid="scatter"
      data-valid={points.length}
      data-total={stores.length}
      data-range={range}
      data-auto-range={auto}
      data-in-zoom={inZoom}
      data-in-range={inRange.length}
      data-groups={groups.length}
    >
      <p className={s.caption}>
        가로축은 시군구 매출 상위 %(ccgSaleRnk), 세로축은 전국 매출 상위 %(allSaleRnk)입니다. 두 축 모두 같은 업종 안에서 비교한 원본
        값이고, 숫자가 작을수록 상위입니다. 왼쪽 위로 갈수록 두 값이 모두 작습니다.
      </p>
      <div className={s.seg} role="group" aria-label="축 범위">
        {([FULL, ZOOM] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            className={s.segBtn}
            data-testid="scatter-range"
            data-range={r}
            aria-pressed={range === r}
            onClick={() => {
              setRange(r);
              setOpenKey(null);
            }}
          >
            {r === FULL ? "0~100% 전체" : "0~10% 확대"}
          </button>
        ))}
      </div>
      <p className={s.scatterCount}>
        두 값이 모두 있는 매장 <span className={s.num}>{points.length}곳</span> / 조건에 맞는 매장{" "}
        <span className={s.num}>{stores.length}곳</span>
        {outside > 0 ? (
          <>
            . 두 값 중 하나라도 {range}%를 넘는 <span className={s.num}>{outside}곳</span>은 이 범위에서 빠집니다
          </>
        ) : null}
        {multi.length > 0 ? (
          <>
            . 겹친 자리 <span className={s.num}>{multi.length}곳</span>은 매장 수를 적은 표식으로 묶었습니다
          </>
        ) : null}
      </p>
      {points.length === 0 ? (
        <p className={s.empty}>두 순위 값이 모두 있는 매장이 없습니다.</p>
      ) : (
        <>
          <div className={s.scatterFrame}>
            <p className={s.axisY} aria-hidden="true">
              세로축: 전국 매출 상위 %, 위쪽이 상위
            </p>
            <div className={s.scatterGrid}>
              <div className={s.ticksY} aria-hidden="true">
                {ticks.map((v) => (
                  <span key={v} style={{ top: at(v) }}>
                    {v}%
                  </span>
                ))}
              </div>
              <div ref={plotRef} className={s.plot}>
                <svg className={s.plotSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  {ticks.map((v) => {
                    const u = (v / range) * 100;
                    return (
                      <g key={v}>
                        <line x1={u} y1={0} x2={u} y2={100} className={s.gridLine} vectorEffect="non-scaling-stroke" />
                        <line x1={0} y1={u} x2={100} y2={u} className={s.gridLine} vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  })}
                  <line x1={0} y1={0} x2={100} y2={100} className={s.refLine} vectorEffect="non-scaling-stroke" />
                </svg>
                <span className={`${s.plotNote} ${s.plotNoteTop}`} aria-hidden="true">
                  전국 상위 %가 더 작음
                </span>
                <span className={`${s.plotNote} ${s.plotNoteBottom}`} aria-hidden="true">
                  시군구 상위 %가 더 작음
                </span>
                <ul className={s.dots} aria-label="매장 점. 고르면 결제 영수증을 엽니다">
                  {groups.map((g) => {
                    const key = groupKey(g);
                    const pos = { left: at(g.x), top: at(g.y) };
                    if (g.points.length === 1) {
                      const p = g.points[0];
                      return (
                        <li key={key} className={s.dotItem} style={pos}>
                          <button
                            type="button"
                            className={s.dot}
                            data-testid="scatter-point"
                            data-store-id={p.store.id}
                            data-count={1}
                            data-ccg={p.ccg}
                            data-all={p.all}
                            data-selected={p.store.id === selectedId}
                            aria-label={pointLabel(p.store, p.ccg, p.all)}
                            onClick={(e) => onOpen(p.store, e.currentTarget)}
                          />
                        </li>
                      );
                    }
                    const xs = g.points.map((p) => p.ccg);
                    const ys = g.points.map((p) => p.all);
                    const range = (v: number[]) => {
                      const lo = Math.min(...v);
                      const hi = Math.max(...v);
                      return lo === hi ? formatRank(lo) : `${formatRank(lo)}~${formatRank(hi)}`;
                    };
                    const isOpen = openKey === key;
                    return (
                      <li key={key} className={s.dotItem} style={pos}>
                        <button
                          type="button"
                          className={`${s.dot} ${s.dotGroup}`}
                          data-testid="scatter-point"
                          data-store-ids={key}
                          data-count={g.points.length}
                          data-selected={g.points.some((p) => p.store.id === selectedId)}
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? listId : undefined}
                          aria-label={`겹친 매장 ${g.points.length}곳, 시군구 매출 상위 ${range(xs)}, 전국 매출 상위 ${range(ys)}. 눌러서 매장 고르기`}
                          onClick={() => setOpenKey(isOpen ? null : key)}
                        >
                          {g.points.length}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className={s.ticksX} aria-hidden="true">
                {ticks.map((v) => (
                  <span key={v} style={{ left: at(v) }}>
                    {v}%
                  </span>
                ))}
              </div>
            </div>
            <p className={s.axisX} aria-hidden="true">
              가로축: 시군구 매출 상위 %, 왼쪽이 상위
            </p>
          </div>
          <p className={s.legendLine}>
            <span className={s.refSwatch} aria-hidden="true" /> 점선은 두 값이 같은 선입니다. 점선 오른쪽 위는 전국 상위 %가, 왼쪽 아래는 시군구 상위 %가 더 작은 매장입니다. 숫자 표식은 겹친 매장 수입니다.
          </p>
          {open ? (
            <div className={s.pickBox} id={listId} data-testid="scatter-group-list">
              <div className={s.pickHead}>
                <p className={s.pickTitle}>
                  이 자리의 매장 <span className={s.num}>{open.points.length}곳</span>
                </p>
                <button type="button" className={s.more} onClick={() => setOpenKey(null)}>
                  닫기
                </button>
              </div>
              <ul className={s.pickList}>
                {open.points.map((p) => (
                  <li key={p.store.id}>
                    <button
                      type="button"
                      className={s.pick}
                      data-testid="scatter-pick"
                      data-store-id={p.store.id}
                      data-selected={p.store.id === selectedId}
                      aria-label={pointLabel(p.store, p.ccg, p.all)}
                      onClick={(e) => onOpen(p.store, e.currentTarget)}
                    >
                      <span className={s.pickName}>{displayName(p.store.name)}</span>
                      <span className={s.pickMeta}>
                        시군구 상위 <span className={s.num}>{formatRank(p.ccg)}</span>, 전국 상위{" "}
                        <span className={s.num}>{formatRank(p.all)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
