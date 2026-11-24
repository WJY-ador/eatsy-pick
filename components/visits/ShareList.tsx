"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  SHARE_MAX_STORES,
  SHARE_TITLE_MAX,
  canShareStore,
  cleanTitle,
  encodeSharedList,
  sharedListPath,
} from "@/lib/share-list";
import { displayName } from "@/lib/store-view";
import type { VisitRecord } from "@/lib/visits";
import { copyText } from "./clipboard";
import s from "./visits.module.css";

type Note = { ok: boolean; text: string } | null;
/** 만든 링크와 그 링크를 만든 조건(제목과 고른 가게) */
type Built = { sig: string; url: string | null };

const noSubscribe = () => () => {};
const shareSupported = () => typeof navigator.share === "function";
const noShareOnServer = () => false;

const COPY_OK = "링크를 복사했습니다. 받는 사람은 이 링크로 목록만 볼 수 있습니다.";
const COPY_FAIL = "복사하지 못했습니다. 아래 링크를 길게 눌러 직접 복사해 주세요.";

/** 처음 고를 가게: 공유할 수 있는 가게를 상한까지 */
function initialPick(records: VisitRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    if (out.size >= SHARE_MAX_STORES) break;
    if (canShareStore(r.store)) out.add(r.store.id);
  }
  return out;
}

/**
 * 리스트 공유. 저장한 곳에서 가게를 고르고 제목을 적으면 읽기 전용 목록 링크를 만든다.
 * 링크에는 lib/share-list의 허용 목록(가게명, 업종, 주소, 시군구, 지역 매출 상위 %, 잇플 주소, 제목)만 담긴다.
 * records는 저장된 기록(isSaved)만 받는다. 저장 해제된 기록은 고를 목록에 나오지 않는다.
 * 공유 창이 있으면 공유 창을 열고, 없거나 실패하면 링크를 복사한다.
 */
export function ShareList({ records }: { records: VisitRecord[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => initialPick(records));
  const [built, setBuilt] = useState<Built | null>(null);
  const [note, setNote] = useState<Note>(null);
  const canShare = useSyncExternalStore(noSubscribe, shareSupported, noShareOnServer);
  const panelId = useId();
  const toggleId = useId();
  const titleId = useId();
  const pickId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const focusTitle = useRef(false);

  // 패널을 열면 초점을 목록 제목 입력으로 옮긴다.
  useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    titleRef.current?.focus();
  });

  // 저장을 푼 가게는 고른 목록에서도 뺀다.
  const ids = useMemo(() => new Set(records.map((r) => r.store.id)), [records]);
  const chosen = useMemo(
    () => records.filter((r) => picked.has(r.store.id) && canShareStore(r.store)).map((r) => r.store),
    [records, picked],
  );
  const count = chosen.length;
  const sig = `${title}\n${chosen.map((c) => c.id).join(",")}`;
  // 조건이 바뀐 뒤 아직 새 링크가 없으면 옛 링크를 쓰지 않는다.
  const link = built && built.sig === sig ? built.url : null;

  // 고른 가게와 제목이 바뀌면 링크를 다시 만든다. 누르는 순간 바로 공유 창을 열 수 있게 미리 만든다.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    encodeSharedList(title, chosen).then((d) => {
      if (alive) setBuilt({ sig, url: d ? new URL(sharedListPath(d), window.location.origin).href : null });
    });
    return () => {
      alive = false;
    };
  }, [open, title, chosen, sig]);

  const toggle = (id: string) => {
    setNote(null);
    setPicked((prev) => {
      const next = new Set([...prev].filter((x) => ids.has(x)));
      if (next.has(id)) next.delete(id);
      else if (next.size < SHARE_MAX_STORES) next.add(id);
      return next;
    });
  };

  const copy = async () => {
    if (!link) return;
    const ok = await copyText(link);
    setNote({ ok, text: ok ? COPY_OK : COPY_FAIL });
  };

  const share = async () => {
    if (!link) return;
    if (canShare) {
      try {
        await navigator.share({ title: cleanTitle(title), url: link });
        setNote({ ok: true, text: "공유 창으로 링크를 보냈습니다." });
        return;
      } catch (e) {
        // 사용자가 공유 창을 닫은 것은 실패가 아니다.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy();
  };

  const empty = records.length === 0;
  const toggleButton = (
    <button
      id={toggleId}
      type="button"
      className={s.btn}
      data-testid="list-share"
      disabled={empty}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={() => {
        if (open) {
          setOpen(false);
          setNote(null);
          return;
        }
        focusTitle.current = true;
        setPicked((prev) => (prev.size > 0 ? prev : initialPick(records)));
        setOpen(true);
      }}
    >
      리스트 공유
    </button>
  );

  const full = count >= SHARE_MAX_STORES;

  // 버튼은 열고 닫아도 같은 자리에 남는다(닫은 뒤에도 초점이 버튼에 머문다).
  return (
    <div className={s.shareBar}>
      {toggleButton}
      {open ? (
        <section className={s.share} id={panelId} aria-labelledby={toggleId}>
          <p className={s.note}>
            고른 가게의 이름, 업종, 주소, 지역 매출 순위, 잇플 링크와 목록 제목만 링크에 담깁니다. 단계, 태그, 메모, 방문 기록, 반응, 위치는 담지 않습니다. 링크를 받은 사람은 누구나 목록을 볼 수 있습니다.
          </p>
          <div className={s.field}>
            <label className={s.legend} htmlFor={titleId}>
              목록 제목
            </label>
            <input
              ref={titleRef}
              id={titleId}
              className={s.input}
              data-testid="share-title"
              type="text"
              value={title}
              maxLength={SHARE_TITLE_MAX}
              placeholder="예: 금요일 팀 회식 후보"
              onChange={(e) => {
                setNote(null);
                setTitle(e.target.value);
              }}
            />
          </div>
          <fieldset className={s.pick}>
            <legend className={s.legend} id={pickId}>
              담을 가게{" "}
              <span className={s.num}>
                {count}/{SHARE_MAX_STORES}
              </span>
            </legend>
            <ul className={s.pickList}>
              {records.map((r) => {
                const ok = canShareStore(r.store);
                const on = ok && picked.has(r.store.id);
                return (
                  <li key={r.store.id}>
                    <label className={s.pickItem} data-disabled={!ok || (!on && full) ? "true" : undefined}>
                      <input
                        type="checkbox"
                        className={s.check}
                        checked={on}
                        disabled={!ok || (!on && full)}
                        onChange={() => toggle(r.store.id)}
                      />
                      <span className={s.pickText}>
                        <span className={s.itemName}>{displayName(r.store.name)}</span>
                        <span className={s.itemMeta}>{ok ? r.store.category : "잇플 링크가 없어 담을 수 없습니다"}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {full ? <p className={s.note}>한 목록에는 {SHARE_MAX_STORES}곳까지 담을 수 있습니다.</p> : null}
          </fieldset>
          <div className={s.actions}>
            <button type="button" className={s.btnPrimary} data-testid="share-go" disabled={!link} onClick={share}>
              {canShare ? "공유하기" : "링크 복사"}
            </button>
            {canShare ? (
              <button type="button" className={s.btn} data-testid="share-copy" disabled={!link} onClick={copy}>
                링크 복사
              </button>
            ) : null}
          </div>
          {count === 0 ? <p className={s.note}>담을 가게를 하나 이상 골라 주세요.</p> : null}
          {count > 0 && built && built.sig === sig && built.url === null ? (
            <p className={s.note}>링크가 너무 길어 만들 수 없습니다. 담을 가게를 줄여 주세요.</p>
          ) : null}
          <p className={s.shareNote} role="status" data-ok={note?.ok === false ? "false" : "true"}>
            {note?.text ?? ""}
          </p>
          {link ? (
            <input
              className={s.input}
              data-testid="share-link"
              type="text"
              readOnly
              value={link}
              aria-label="공유 링크"
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
