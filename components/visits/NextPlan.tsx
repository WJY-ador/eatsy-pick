"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MerLink } from "@/components/MerLink";
import { OCCASIONS, type Occasion, PEAK_DAYS, PEAK_MATCH_TEXT, PEAK_TIMES, planNext } from "@/lib/plan";
import type { Store } from "@/lib/stores";
import { displayName } from "@/lib/store-view";
import { sortRecords, useVisits } from "@/lib/visits";
import s from "./visits.module.css";

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  wide = false,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={s.field}>
      <p className={s.legend} id={id}>
        {label} <span className={s.optional}>선택</span>
      </p>
      <div className={wide ? s.chipsDays : s.chips} role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={s.chip}
            aria-pressed={value === o}
            onClick={() => onChange(value === o ? null : o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 상호. onOpen이 있으면 상호 자체가 영수증을 여는 버튼이다(44px, 밑줄). */
export function StoreName({ store, onOpen }: { store: Store; onOpen?: (store: Store) => void }) {
  const name = displayName(store.name);
  if (!onOpen) return <span className={s.itemName}>{name}</span>;
  return (
    <button
      type="button"
      className={s.nameBtn}
      aria-label={`${name} 영수증 열기`}
      onClick={() => onOpen(store)}
    >
      {name}
    </button>
  );
}

function PlanItem({
  store,
  reason,
  peakMatch,
  mine,
  onOpen,
}: {
  store: Store;
  reason: string;
  peakMatch: boolean;
  mine: boolean;
  onOpen?: (store: Store) => void;
}) {
  return (
    <li className={s.item}>
      <div className={s.itemHead}>
        <StoreName store={store} onOpen={onOpen} />
        <span className={s.itemMeta}>{store.category}</span>
      </div>
      <p className={s.reason}>
        {mine ? <span className={s.dot} aria-hidden="true" /> : null}
        {reason}
      </p>
      {peakMatch ? <p className={s.peak}>{PEAK_MATCH_TEXT}</p> : null}
      <div className={s.actions}>
        <MerLink merUrl={store.merUrl ?? undefined} className={s.cta} />
      </div>
    </li>
  );
}

/**
 * 다음 약속. 세 모양이 있다.
 * - 관련 기록(다시 갈래요를 남긴 방문)이 없으면 접힌 한 줄.
 * - 관련 기록이 있으면 기본은 미리보기: 제목, "내가 남긴 방문 기록" 첫 후보 1곳(상호 버튼이 영수증을 연다), "조건 고르고 더 보기".
 *   홈 첫 화면의 근처 후보를 밀어내지 않게 390에서 200px 이하로 둔다.
 * - 펼치면 모임 유형, 시간 조건과 "내가 남긴 방문 기록", "BC카드 결제 근거" 두 묶음. defaultOpen이면 펼친 채 시작한다.
 * 접힘 여부는 고른 모임 유형, 시간 조건과 무관하다.
 * onOpen은 후보의 영수증을 연다. 기록의 매장이 지금 목록에 없을 수 있어서 Store 전체를 넘긴다.
 */
export function NextPlan({
  stores,
  title,
  onOpen,
  defaultOpen = false,
}: {
  stores: Store[];
  title: string;
  onOpen?: (store: Store) => void;
  defaultOpen?: boolean;
}) {
  const { records } = useVisits();
  const [open, setOpen] = useState(defaultOpen);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusToggle = useRef(false);
  // 미리보기와 펼친 모양을 오가면 버튼이 바뀌므로 새 토글 버튼으로 초점을 옮긴다.
  useEffect(() => {
    if (!focusToggle.current) return;
    focusToggle.current = false;
    toggleRef.current?.focus();
  });
  const toggle = (next: boolean) => () => {
    focusToggle.current = true;
    setOpen(next);
  };
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const headId = useId();
  const mineId = useId();
  const freshId = useId();

  const list = useMemo(() => sortRecords(records), [records]);
  const plan = useMemo(
    () => planNext({ records: list, stores, occasion, day, time }),
    [list, stores, occasion, day, time],
  );

  if (plan.revisit.length === 0) {
    return <p className={s.planCollapsed}>다녀온 곳을 남기면 다음 약속에서 다시 보여 드립니다</p>;
  }

  if (!open) {
    const first = plan.revisit[0];
    const store = first.record.store;
    return (
      <section className={s.preview} aria-labelledby={headId}>
        <div className={s.previewHead}>
          <div className={s.previewTitles}>
            <h2 className={s.planTitle} id={headId}>
              다음 약속
            </h2>
            <h3 className={s.previewGroup} id={mineId}>
              내가 남긴 방문 기록
            </h3>
          </div>
          <button ref={toggleRef} type="button" className={s.btn} aria-expanded={false} onClick={toggle(true)}>
            조건 고르고 더 보기
          </button>
        </div>
        <div className={s.previewItem} aria-labelledby={mineId} role="group">
          <p className={s.previewName}>
            <StoreName store={store} onOpen={onOpen} />
            <span className={s.itemMeta}>{store.category}</span>
          </p>
          <p className={s.reason}>
            <span className={s.dot} aria-hidden="true" />
            {first.reason}
          </p>
          <div className={s.actions}>
            <MerLink merUrl={store.merUrl ?? undefined} className={s.cta} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={s.plan} aria-labelledby={headId}>
      <div className={s.previewHead}>
        <h2 className={s.planTitle} id={headId}>
          다음 약속
        </h2>
        <button ref={toggleRef} type="button" className={s.btnQuiet} aria-expanded={true} onClick={toggle(false)}>
          접기
        </button>
      </div>
      <p className={s.planSub}>{title} 조회 결과와 이 기기의 방문 기록으로 고릅니다.</p>
      <Chips label="모임 유형" options={OCCASIONS} value={occasion} onChange={setOccasion} />
      <Chips label="요일" options={PEAK_DAYS} value={day as (typeof PEAK_DAYS)[number] | null} onChange={setDay} wide />
      <Chips
        label="시간대"
        options={PEAK_TIMES}
        value={time as (typeof PEAK_TIMES)[number] | null}
        onChange={setTime}
      />

      <section className={s.group} aria-labelledby={mineId}>
        <h3 className={s.groupTitle} id={mineId}>
          내가 남긴 방문 기록
        </h3>
        <ul className={s.items}>
          {plan.revisit.map((r) => (
            <PlanItem
              key={r.record.store.id}
              store={r.record.store}
              reason={r.reason}
              peakMatch={r.peakMatch}
              mine
              onOpen={onOpen}
            />
          ))}
        </ul>
      </section>

      <section className={s.group} aria-labelledby={freshId}>
        <h3 className={s.groupTitle} id={freshId}>
          BC카드 결제 근거
        </h3>
        {plan.fresh.length === 0 ? (
          <p className={s.note}>조건에 맞는 새 가게가 없습니다.</p>
        ) : (
          <ul className={s.items}>
            {plan.fresh.map((f) => (
              <PlanItem
                key={f.store.id}
                store={f.store}
                reason={f.reason}
                peakMatch={f.peakMatch}
                mine={false}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
