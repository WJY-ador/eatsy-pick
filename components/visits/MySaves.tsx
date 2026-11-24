"use client";

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { MerLink } from "@/components/MerLink";
import type { Store } from "@/lib/stores";
import { displayName, percentLabel } from "@/lib/store-view";
import type { SavesFilter } from "@/lib/ui-state";
import {
  NOT_PERSISTENT_TEXT,
  STAGES,
  type Stage,
  type VisitRecord,
  clearAll,
  clearVisits,
  deleteCrm,
  hasNotes,
  isSaved,
  save,
  sortRecords,
  useVisits,
} from "@/lib/visits";
import { BookmarkButton } from "./BookmarkButton";
import { CrmEditor } from "./CrmEditor";
import { REACTION_LABEL, dayLabel } from "./format";
import { NextPlan, StoreName } from "./NextPlan";
import { ShareList } from "./ShareList";
import { VisitControls } from "./VisitControls";
import s from "./visits.module.css";

type Tab = "saved" | "visited";
const TABS: { id: Tab; label: string }[] = [
  { id: "saved", label: "저장한 곳" },
  { id: "visited", label: "다녀온 곳" },
];
const STAGE_TABS: { id: SavesFilter; label: string }[] = [{ id: "all", label: "전체" }, ...STAGES];
const STAGE_LABEL = Object.fromEntries(STAGES.map((st) => [st.id, st.label])) as Record<Stage, string>;

function lastVisit(r: VisitRecord) {
  return r.visits.reduce((a, b) => (b.at >= a.at ? b : a));
}

const desc = (a: string, b: string) => (a === b ? 0 : a < b ? 1 : -1);

/** 저장한 곳에 쓰인 태그. 많이 쓴 순, 같으면 먼저 나온 순 */
function tagsIn(records: VisitRecord[]): string[] {
  const count = new Map<string, number>();
  for (const r of records) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
}

/** 가게 이름 줄: 이름(영수증 열기), 업종, 지역 매출 상위 %, 북마크 */
function ItemHead({ store, onOpen }: { store: Store; onOpen?: (store: Store) => void }) {
  return (
    <div className={s.itemRow}>
      <div className={s.itemMain}>
        <StoreName store={store} onOpen={onOpen} />
        <span className={s.itemMeta}>
          {store.category}
          {typeof store.ccgRank === "number" ? (
            <>
              , {store.sigungu || "지역"} 매출 상위 <span className={s.num}>{percentLabel(store.ccgRank)}</span>
            </>
          ) : null}
        </span>
      </div>
      <BookmarkButton store={store} />
    </div>
  );
}

/** 단계, 태그, 메모 한 줄 요약 */
function CrmSummary({ r, showStage = true }: { r: VisitRecord; showStage?: boolean }) {
  if (!showStage && !hasNotes(r)) return null;
  return (
    <div className={s.crmSummary}>
      <ul className={s.tags} aria-label="단계와 태그">
        {showStage ? <li className={s.tagStrong}>{STAGE_LABEL[r.stage]}</li> : null}
        {r.tags.map((t) => (
          <li key={t} className={s.tag}>
            #{t}
          </li>
        ))}
      </ul>
      {r.memo ? <p className={s.memoLine}>{r.memo}</p> : null}
    </div>
  );
}

/**
 * 내 저장. 저장한 곳(북마크)과 다녀온 곳(다녀왔어요를 직접 누른 곳)을 탭으로 나눠 본다.
 * 저장은 방문이 아니다. 다녀온 곳에는 다녀왔어요를 누른 가게만 들어간다.
 * 저장한 곳은 단계 탭과 태그 필터를 함께 걸어 본다. 항목마다 영수증과 같은 편집기로 단계, 태그, 메모를 고친다.
 * 저장을 풀었지만 태그나 메모가 남은 곳은 저장한 곳 아래 접힌 목록에서 다시 저장하거나 태그와 메모를 지운다.
 * 저장한 곳에서 리스트 공유로 읽기 전용 목록 링크를 만든다. 다녀온 곳에는 다음 약속 후보를 함께 둔다.
 * stage, stageSeq: openSaves(단계)로 열 때의 필터와 그 호출 번호. 번호가 바뀌면 저장한 곳 탭과 그 단계로 맞춘다.
 */
export function MySaves({
  stores,
  title,
  onOpen,
  stage = "all",
  stageSeq = 0,
}: {
  stores: Store[];
  title: string;
  onOpen?: (store: Store) => void;
  stage?: SavesFilter;
  stageSeq?: number;
}) {
  const { records, persistent } = useVisits();
  const all = useMemo(() => sortRecords(records), [records]);
  const saved = useMemo(
    () => all.filter((r) => isSaved(r)).sort((a, b) => desc(a.savedAt ?? "", b.savedAt ?? "")),
    [all],
  );
  const visited = useMemo(
    () => all.filter((r) => r.visits.length > 0).sort((a, b) => desc(lastVisit(a).at, lastVisit(b).at)),
    [all],
  );
  const unsavedNotes = useMemo(() => all.filter((r) => !isSaved(r) && hasNotes(r)), [all]);
  const tagOptions = useMemo(() => tagsIn(saved), [saved]);

  const [tab, setTab] = useState<Tab>("saved");
  const [stageFilter, setStageFilter] = useState<SavesFilter>(stage);
  const [tagPick, setTagPick] = useState<string | null>(null);
  const [seq, setSeq] = useState(stageSeq);
  // openSaves(단계)가 다시 불리면(시트가 열린 채로도) 저장한 곳 탭과 그 단계로 맞춘다.
  if (seq !== stageSeq) {
    setSeq(stageSeq);
    setTab("saved");
    setStageFilter(stage);
    setTagPick(null);
  }
  // 고른 태그가 더는 쓰이지 않으면 필터를 풀어 본다.
  const tagFilter = tagPick && tagOptions.includes(tagPick) ? tagPick : null;
  const shown = saved.filter(
    (r) => (stageFilter === "all" || r.stage === stageFilter) && (!tagFilter || r.tags.includes(tagFilter)),
  );
  const stageCount = (id: SavesFilter) => (id === "all" ? saved.length : saved.filter((r) => r.stage === id).length);

  const [editing, setEditing] = useState<string | null>(null);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const baseId = useId();
  const unsavedId = useId();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ saved: null, visited: null });
  const stageRef = useRef<HTMLButtonElement | null>(null);
  // 누른 항목이 목록에서 사라지면(저장 해제, 단계를 바꿔 필터 밖으로, 방문 기록 지우기, 모두 지우기) 초점을 지금 필터 탭으로 옮긴다.
  const clicked = useRef<Element | null>(null);

  useEffect(() => {
    const el = clicked.current;
    clicked.current = null;
    if (!el || document.contains(el)) return;
    const a = document.activeElement;
    if (a && a !== document.body && document.contains(a)) return;
    (tab === "saved" && stageRef.current ? stageRef.current : tabRefs.current[tab])?.focus();
  });

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  const counts: Record<Tab, number> = { saved: saved.length, visited: visited.length };

  return (
    <div
      className={s.saves}
      onClickCapture={(e) => {
        clicked.current = e.target instanceof Element ? e.target : null;
      }}
    >
      <div className={s.tabs} role="tablist" aria-label="내 저장 보기">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            className={s.tab}
            data-testid={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
          >
            {t.label} <span className={s.num}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {tab === "saved" ? (
        <div
          className={s.panel}
          role="tabpanel"
          id={`${baseId}-panel-saved`}
          aria-labelledby={`${baseId}-tab-saved`}
          data-testid="panel-saved"
        >
          <ShareList records={saved} />
          <div className={s.filters}>
            <div className={s.filterRow}>
              <p className={s.filterLabel} id={`${baseId}-stage`}>
                단계
              </p>
              <div className={s.chips} role="group" aria-labelledby={`${baseId}-stage`}>
                {STAGE_TABS.map((st) => (
                  <button
                    key={st.id}
                    ref={stageFilter === st.id ? stageRef : undefined}
                    type="button"
                    className={s.chip}
                    data-testid="stage-tab"
                    data-stage={st.id}
                    aria-pressed={stageFilter === st.id}
                    onClick={() => setStageFilter(st.id)}
                  >
                    {st.label} <span className={s.num}>{stageCount(st.id)}</span>
                  </button>
                ))}
              </div>
            </div>
            {tagOptions.length > 0 ? (
              <div className={s.filterRow}>
                <p className={s.filterLabel} id={`${baseId}-tag`}>
                  태그
                </p>
                <div className={s.chips} role="group" aria-labelledby={`${baseId}-tag`}>
                  {tagOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`${s.chip} ${s.chipSmall}`}
                      data-testid="tag-filter"
                      data-tag={t}
                      aria-pressed={tagFilter === t}
                      onClick={() => setTagPick(tagFilter === t ? null : t)}
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {saved.length === 0 ? (
            <p className={s.empty}>저장한 곳이 아직 없습니다. 가게 카드나 영수증의 북마크를 누르면 여기에 모입니다.</p>
          ) : shown.length === 0 ? (
            <div className={s.emptyFilter}>
              <p className={s.empty}>이 조건에 맞는 저장한 곳이 없습니다.</p>
              <button
                type="button"
                className={s.btn}
                onClick={() => {
                  setStageFilter("all");
                  setTagPick(null);
                }}
              >
                조건 풀기
              </button>
            </div>
          ) : (
            <ul className={s.items}>
              {shown.map((r) => {
                const open = editing === r.store.id;
                return (
                  <li key={r.store.id} className={s.item} data-testid="saved-item" data-id={r.store.id}>
                    <ItemHead store={r.store} onOpen={onOpen} />
                    <p className={s.itemMeta}>
                      저장 {r.savedAt ? dayLabel(r.savedAt) : ""}
                      {r.visits.length > 0 ? (
                        <>
                          , 방문 <span className={s.num}>{r.visits.length}</span>회
                        </>
                      ) : null}
                    </p>
                    {open ? <CrmEditor store={r.store} /> : <CrmSummary r={r} />}
                    <div className={s.actions}>
                      <button
                        type="button"
                        className={s.btnQuiet}
                        data-testid="saved-edit"
                        aria-expanded={open}
                        onClick={() => setEditing(open ? null : r.store.id)}
                      >
                        {open ? "편집 닫기" : "단계, 태그, 메모 고치기"}
                      </button>
                    </div>
                    <div className={s.actions}>
                      <VisitControls store={r.store} compact />
                      <MerLink merUrl={r.store.merUrl} className={s.cta} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {unsavedNotes.length > 0 ? (
            <div className={s.unsaved}>
              <button
                type="button"
                className={s.unsavedToggle}
                data-testid="unsaved-toggle"
                aria-expanded={unsavedOpen}
                aria-controls={unsavedOpen ? unsavedId : undefined}
                onClick={() => setUnsavedOpen(!unsavedOpen)}
              >
                <span>
                  저장 해제한 곳 <span className={s.num}>{unsavedNotes.length}</span>
                </span>
                <span className={s.chev} data-open={unsavedOpen ? "true" : "false"} aria-hidden="true" />
              </button>
              {unsavedOpen ? (
                <div id={unsavedId} className={s.unsavedBody}>
                  <p className={s.note}>
                    저장은 풀었지만 태그나 메모가 남은 곳입니다. 다시 저장하면 단계, 태그, 메모가 돌아옵니다.
                  </p>
                  <ul className={s.items}>
                    {unsavedNotes.map((r) => (
                      <li key={r.store.id} className={s.item} data-testid="unsaved-item" data-id={r.store.id}>
                        <div className={s.itemMain}>
                          <StoreName store={r.store} onOpen={onOpen} />
                          <span className={s.itemMeta}>{r.store.category}</span>
                        </div>
                        <CrmSummary r={r} showStage={false} />
                        <div className={s.actions}>
                          <button
                            type="button"
                            className={s.btn}
                            data-testid="unsaved-restore"
                            aria-label={`${displayName(r.store.name)} 다시 저장`}
                            onClick={() => save(r.store)}
                          >
                            다시 저장
                          </button>
                          <button
                            type="button"
                            className={s.btnQuiet}
                            data-testid="unsaved-remove"
                            aria-label={`${displayName(r.store.name)} 태그와 메모 삭제`}
                            onClick={() => deleteCrm(r.store.id)}
                          >
                            태그와 메모 삭제
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={s.panel}
          role="tabpanel"
          id={`${baseId}-panel-visited`}
          aria-labelledby={`${baseId}-tab-visited`}
          data-testid="panel-visited"
        >
          {visited.length === 0 ? (
            <p className={s.empty}>
              다녀온 곳이 아직 없습니다. 저장한 곳이나 영수증에서 다녀왔어요를 누르면 여기에 남습니다.
            </p>
          ) : (
            <ul className={s.items}>
              {visited.map((r) => {
                const last = lastVisit(r);
                return (
                  <li key={r.store.id} className={s.item} data-testid="visited-item">
                    <ItemHead store={r.store} onOpen={onOpen} />
                    <ul className={s.tags} aria-label="방문 기록">
                      <li className={s.tag}>
                        방문 <span className={s.num}>{r.visits.length}</span>회, 최근 {dayLabel(last.at)}
                        {last.occasion ? `, ${last.occasion}` : ""}
                      </li>
                      {r.reaction ? <li className={s.tagStrong}>{REACTION_LABEL[r.reaction]}</li> : null}
                    </ul>
                    <VisitControls store={r.store} compact />
                    <div className={s.actions}>
                      <MerLink merUrl={r.store.merUrl} className={s.cta} />
                      <button
                        type="button"
                        className={s.btnQuiet}
                        aria-label={`${displayName(r.store.name)} 방문 기록 지우기`}
                        onClick={() => clearVisits(r.store.id)}
                      >
                        방문 기록 지우기
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className={s.flat}>
            <NextPlan stores={stores} title={title} onOpen={onOpen} defaultOpen />
          </div>
        </div>
      )}

      <div className={s.savesFoot}>
        <p className={s.note}>저장, 방문 기록, 단계, 태그, 메모는 이 기기에만 남습니다.</p>
        {persistent ? null : <p className={s.note}>{NOT_PERSISTENT_TEXT}</p>}
        {all.length === 0 ? null : confirming ? (
          <div className={s.confirm} role="group" aria-label="전체 삭제 확인">
            <p className={s.detailLine}>
              가게 <span className={s.num}>{all.length}</span>곳의 저장, 방문 기록, 태그와 메모를 모두 지울까요?
            </p>
            <div className={s.actions}>
              <button
                type="button"
                className={s.btnDanger}
                onClick={() => {
                  clearAll();
                  setConfirming(false);
                }}
              >
                모두 지우기
              </button>
              <button type="button" className={s.btn} onClick={() => setConfirming(false)}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className={s.actions}>
            <button type="button" className={s.btnQuiet} onClick={() => setConfirming(true)}>
              모든 기록 지우기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
