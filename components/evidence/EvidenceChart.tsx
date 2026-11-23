"use client";

import type { JSX } from "react";
import { PeakTable } from "@/components/analysis/Charts";
import {
  type EvidenceKind,
  type FlagEvidence,
  evidenceLabel,
  flagEvidence,
  flagSentence,
  missingSentence,
  peakEvidence,
  peakSentence,
  pickEvidence,
  rankEvidence,
  timeLine,
} from "@/lib/evidence";
import { percentLabel } from "@/lib/store-view";
import type { Store } from "@/lib/stores";
import s from "./evidence.module.css";

type Props = { store: Store; kind: EvidenceKind; stores: Store[]; scopeLabel: string; time?: { day?: string; time?: string } };

const FLAG_TITLE = { local: "동네맛집 표시", hoesik: "회식 적합 표시" } as const;

function Notes({ lines }: { lines: (string | null)[] }) {
  const shown = lines.filter((l): l is string => Boolean(l));
  return (
    <figcaption className={s.notes}>
      {shown.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </figcaption>
  );
}

/** 비교할 데이터가 없을 때: 이 매장에 실제로 있는 근거만 글자로 */
function Fallback({ store, kind, reason }: { store: Store; kind: EvidenceKind; reason: string }) {
  const kinds = pickEvidence(store);
  return (
    <figure className={s.fig} data-kind={kind} data-chart="false">
      <p className={s.lead}>이 매장의 근거</p>
      {kinds.length > 0 ? (
        <ul className={s.facts}>
          {kinds.map((k) => (
            <li key={k}>{evidenceLabel(store, k)}</li>
          ))}
        </ul>
      ) : (
        <p className={s.lead}>표시된 근거가 없습니다.</p>
      )}
      <Notes lines={[reason]} />
    </figure>
  );
}

function FlagChart({ e, store, scopeLabel, time }: { e: FlagEvidence; store: Store; scopeLabel: string; time?: Props["time"] }) {
  const rows = [
    { key: "yes", label: "표시 있음", n: e.yes, mine: e.mine === true },
    { key: "no", label: "표시 없음", n: e.no, mine: e.mine === false },
  ];
  const max = Math.max(1, e.yes, e.no);
  const mineText = e.mine === true ? "표시 있음" : e.mine === false ? "표시 없음" : "값 없음";
  return (
    <figure
      className={s.fig}
      data-kind={e.kind}
      data-chart="true"
      data-scope={e.scope.kind}
      data-known={e.known}
      data-yes={e.yes}
      data-no={e.no}
      data-missing={e.missing}
    >
      <p className={s.lead}>
        이 매장: <strong>{mineText}</strong>
      </p>
      <ul className={s.bars} aria-label={`${FLAG_TITLE[e.kind]} 매장 수`}>
        {rows.map((r) => (
          <li key={r.key} className={s.bar} data-mine={r.mine} data-row={r.key} data-count={r.n}>
            <span className={s.barLabel}>
              {r.label}
              {r.mine ? <span className={s.mineTag}>이 매장</span> : null}
            </span>
            <span className={s.track} aria-hidden="true">
              <span className={s.fill} style={{ width: `${(r.n / max) * 100}%` }} />
            </span>
            <span className={s.value}>{r.n}곳</span>
          </li>
        ))}
      </ul>
      <Notes
        lines={[
          `${flagSentence(e)}. 조회 지역 ${scopeLabel}.`,
          missingSentence(e.missing),
          e.kind === "hoesik" ? timeLine(store, time) : null,
        ]}
      />
    </figure>
  );
}

/**
 * 근거 하나를 짧은 차트로 그린다. 시트와 패널 껍데기는 호출 쪽이 맡는다.
 * stores는 호출 쪽이 프랜차이즈 제외 등을 건 조회 결과이고, 여기서 API를 부르지 않는다.
 */
export function EvidenceChart({ store, kind, stores, scopeLabel, time }: Props): JSX.Element {
  if (kind === "local" || kind === "hoesik") {
    const e = flagEvidence(store, stores, kind);
    if (!e.chart) {
      return <Fallback store={store} kind={kind} reason={`비교할 수 있는 매장이 ${e.known}곳이라 차트를 생략했습니다.`} />;
    }
    return <FlagChart e={e} store={store} scopeLabel={scopeLabel} time={time} />;
  }

  if (kind === "peak") {
    const e = peakEvidence(store, stores);
    if (!e.chart) {
      const reason = e.mine === null ? "이 매장의 대표 피크 정보가 없습니다." : `대표 피크를 비교할 수 있는 매장이 ${e.known}곳이라 표를 생략했습니다.`;
      return <Fallback store={store} kind={kind} reason={reason} />;
    }
    return (
      <figure className={s.fig} data-kind="peak" data-chart="true" data-scope={e.scope.kind} data-known={e.known} data-missing={e.missing} data-mine-peak={e.mine ?? ""}>
        <p className={s.lead}>
          이 매장: <strong>{evidenceLabel(store, "peak")}</strong>
        </p>
        <PeakTable grid={e.grid} selected={e.mine} caption="요일과 시간대별 대표 피크 매장 수. 굵은 테두리 셀이 이 매장의 대표 피크입니다." />
        <Notes
          lines={[
            `${peakSentence(e)}. 숫자는 그때가 대표 피크인 매장 수, 굵은 테두리가 이 매장입니다. 조회 지역 ${scopeLabel}.`,
            missingSentence(e.missing),
          ]}
        />
      </figure>
    );
  }

  const r = rankEvidence(store);
  if (!r.chart || r.position === null) return <Fallback store={store} kind="rank" reason="이 매장의 시군구 매출 백분위 정보가 없습니다." />;
  return (
    <figure className={s.fig} data-kind="rank" data-chart="true" data-ccg={r.ccg ?? ""} data-position={r.position}>
      <p className={s.lead}>
        이 매장: <strong>{evidenceLabel(store, "rank")}</strong>
      </p>
      <div className={s.axis} role="img" aria-label={`0에서 100까지 백분위 축, 이 매장 ${percentLabel(r.ccg)}`}>
        <span className={s.axisLine} aria-hidden="true" />
        <span className={s.axisMid} aria-hidden="true" />
        <span className={s.dotWrap} style={{ left: `${r.position}%` }} aria-hidden="true">
          <span className={s.dotLabel} data-edge={r.position > 80 ? "end" : r.position < 20 ? "start" : "mid"}>
            이 매장 {percentLabel(r.ccg)}
          </span>
          <span className={s.dot} />
        </span>
        <span className={s.ticks} aria-hidden="true">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </span>
      </div>
      <Notes
        lines={[
          `수치가 작을수록 상위입니다. BC카드 결제 데이터의 ${r.sigungu || "시군구"} 매출 백분위 원본입니다.`,
          r.all !== null ? `전국 매출 상위 ${percentLabel(r.all)}.` : null,
        ]}
      />
    </figure>
  );
}
