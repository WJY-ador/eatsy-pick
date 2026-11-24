"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { Store } from "@/lib/stores";
import {
  MEMO_MAX,
  QUICK_TAGS,
  STAGES,
  TAG_LEN_MAX,
  TAGS_MAX,
  isSaved,
  normalizeTag,
  save,
  setMemo,
  setStage,
  setTags,
  useVisitRecord,
} from "@/lib/visits";
import s from "./visits.module.css";

/** 한글 조합 중 Enter는 글자 확정이라 추가로 치지 않는다 */
const composing = (e: KeyboardEvent<HTMLInputElement>) => e.nativeEvent.isComposing || e.keyCode === 229;

const TAG_TOO_LONG = `태그는 ${TAG_LEN_MAX}자까지 붙일 수 있습니다.`;
const TAG_FULL = `태그는 ${TAGS_MAX}개까지 붙일 수 있습니다.`;
const TAG_DUP = "이미 붙은 태그입니다.";

/**
 * 저장한 매장의 단계, 태그, 한 줄 메모 편집. 영수증과 내 저장이 같이 쓴다(값은 lib/visits 하나에서 읽어 바로 같아진다).
 * 저장하지 않은 매장이면 저장하고 관리하기 버튼 하나만 둔다. 매장이 바뀌면 key로 새로 그린다(쓰던 메모는 그때 저장).
 * 단계를 바꿔도 저장은 그대로다. 단골은 분류일 뿐 방문 기록을 남기지 않는다.
 * live: store가 지금 조회한 값인지(기본 true). false면 저장하고 관리하기로 저장해도 저장 때 순위를 찍지 않는다.
 */
export function CrmEditor({ store, live = true }: { store: Store; live?: boolean }) {
  const rec = useVisitRecord(store.id);
  const saved = isSaved(rec);
  const stageId = useId();
  const tagId = useId();
  const tagInputId = useId();
  const memoId = useId();
  const memoHintId = useId();
  const [tagText, setTagText] = useState("");
  const [tagNote, setTagNote] = useState("");
  // 쓰는 중인 메모. base는 쓰기 시작할 때의 저장 값이다. 다른 화면에서 메모가 바뀌면 base가 달라져 저장 값을 보여 준다.
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null);
  const firstStage = useRef<HTMLButtonElement>(null);
  const focusStage = useRef(false);
  const pending = useRef<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!focusStage.current) return;
    focusStage.current = false;
    firstStage.current?.focus();
  });

  // 쓰던 메모가 남은 채 닫히면(영수증 닫기, 다른 매장) 그 메모를 저장한다.
  useEffect(
    () => () => {
      const p = pending.current;
      if (p) setMemo(p.id, p.text);
    },
    [],
  );

  if (!rec || !saved) {
    return (
      <div className={s.crmStart}>
        <p className={s.note}>저장하면 단계, 태그, 한 줄 메모로 이 가게를 정리할 수 있습니다.</p>
        <button
          type="button"
          className={s.btn}
          data-testid="crm-start"
          onClick={() => {
            focusStage.current = true;
            save(store, { live });
          }}
        >
          저장하고 관리하기
        </button>
      </div>
    );
  }

  const tags = rec.tags;
  const full = tags.length >= TAGS_MAX;
  const memoValue = draft && draft.base === rec.memo ? draft.text : rec.memo;
  const memoLen = Array.from(memoValue).length;

  const toggleTag = (t: string) => {
    if (tags.includes(t)) {
      setTagNote("");
      setTags(
        store.id,
        tags.filter((x) => x !== t),
      );
      return;
    }
    if (full) {
      setTagNote(TAG_FULL);
      return;
    }
    setTagNote("");
    setTags(store.id, [...tags, t]);
  };

  const addTyped = () => {
    if (!tagText.trim()) return;
    const t = normalizeTag(tagText);
    if (!t) return setTagNote(TAG_TOO_LONG);
    if (tags.includes(t)) return setTagNote(TAG_DUP);
    if (full) return setTagNote(TAG_FULL);
    setTagNote("");
    setTags(store.id, [...tags, t]);
    setTagText("");
  };

  const editMemo = (text: string) => {
    setDraft({ base: rec.memo, text });
    pending.current = { id: store.id, text };
  };

  const commitMemo = () => {
    const p = pending.current;
    pending.current = null;
    setDraft(null);
    if (p && p.text !== rec.memo) setMemo(store.id, p.text);
  };

  return (
    <div className={s.crm}>
      <div className={s.field}>
        <p className={s.legend} id={stageId}>
          단계
        </p>
        <div className={s.chips} role="group" aria-labelledby={stageId}>
          {STAGES.map((st, i) => (
            <button
              key={st.id}
              ref={i === 0 ? firstStage : undefined}
              type="button"
              className={s.chip}
              data-testid="crm-stage"
              data-stage={st.id}
              aria-pressed={rec.stage === st.id}
              onClick={() => setStage(store.id, st.id)}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.field}>
        <p className={s.legend} id={tagId}>
          태그 <span className={s.optional}>{TAGS_MAX}개까지</span>
        </p>
        {tags.length > 0 ? (
          <ul className={s.tagsOn} aria-label="붙은 태그">
            {tags.map((t) => (
              <li key={t} className={s.tagOn} data-testid="crm-tag-on" data-tag={t}>
                <span className={s.tagText}>#{t}</span>
                <button
                  type="button"
                  className={s.tagRemove}
                  aria-label={`#${t} 태그 떼기`}
                  onClick={() => toggleTag(t)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                    <path
                      d="M7 7l10 10M17 7 7 17"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={s.chips} role="group" aria-labelledby={tagId}>
          {QUICK_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={s.chip}
              data-testid="crm-tag"
              data-tag={t}
              aria-pressed={tags.includes(t)}
              onClick={() => toggleTag(t)}
            >
              #{t}
            </button>
          ))}
        </div>
        <div className={s.inline}>
          <label className={s.srOnly} htmlFor={tagInputId}>
            태그 직접 입력
          </label>
          <input
            id={tagInputId}
            className={s.input}
            data-testid="crm-tag-input"
            type="text"
            value={tagText}
            maxLength={TAG_LEN_MAX * 2}
            enterKeyHint="done"
            placeholder={`직접 입력, ${TAG_LEN_MAX}자까지`}
            onChange={(e) => {
              setTagNote("");
              setTagText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || composing(e)) return;
              e.preventDefault();
              addTyped();
            }}
          />
          <button type="button" className={s.btn} onClick={addTyped}>
            추가
          </button>
        </div>
        <p className={s.fieldNote} role="status">
          {tagNote}
        </p>
      </div>

      <div className={s.field}>
        <label className={s.legend} htmlFor={memoId}>
          한 줄 메모
        </label>
        <div className={s.inline}>
          <input
            id={memoId}
            className={s.input}
            data-testid="crm-memo"
            type="text"
            value={memoValue}
            maxLength={MEMO_MAX}
            enterKeyHint="done"
            placeholder="예: 창가 자리가 좋아요"
            aria-describedby={memoHintId}
            onChange={(e) => editMemo(e.target.value)}
            onBlur={commitMemo}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || composing(e)) return;
              e.preventDefault();
              commitMemo();
            }}
          />
          {memoValue ? (
            <button
              type="button"
              className={s.btnQuiet}
              data-testid="crm-memo-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                pending.current = null;
                setDraft(null);
                setMemo(store.id, "");
              }}
            >
              지우기
            </button>
          ) : null}
        </div>
        <p className={s.fieldHint} id={memoHintId}>
          <span className={s.num}>
            {memoLen}/{MEMO_MAX}
          </span>
          자, 입력을 마치면 저장됩니다.
        </p>
      </div>
    </div>
  );
}
