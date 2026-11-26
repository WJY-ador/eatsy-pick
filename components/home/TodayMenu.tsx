"use client";

import "@/app/today-menu.css";
import { useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, type FormEvent, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { MerLink } from "@/components/MerLink";
import { useEscapeLayer } from "@/components/Sheet";
import { type HomeScope, homeHref, scopeEntries } from "@/lib/home-params";
import { ATTRIBUTION } from "@/lib/site";
import { displayName, percentLabel } from "@/lib/store-view";
import {
  CARD_COUNT,
  INPUT_MAX,
  MENU_CHIPS,
  type MenuFilter,
  type MenuStore,
  filterMenuStores,
  loadMenuStores,
  matchMenu,
  menuReady,
  menuStoresUrl,
  resolveMenu,
} from "@/lib/today-menu";

// 오늘 뭐먹지: 홈 우측 하단 버튼, 누르면 바텀 시트(768px 이상은 우측 하단 패널) 채팅. 규칙과 조회는 lib/today-menu.ts.
// 대화는 이 컴포넌트 메모리에만 있다(서버, 분석 도구, 저장소로 보내지 않는다). 홈 지역이 바뀌면 새 대화로 시작한다.
// 문구 규칙(CLAUDE.md 화면 문구): 서로 다른 시군구 가게를 한 줄로 비교하는 말(1위, 가장 높은)을 쓰지 않는다. 매출 상위 %는 원본 그대로 시군구와 함께.

/** 입력 중 점을 보이는 시간(ms) */
const TYPING_MS = 600;
/** 결과 말풍선 전 입력 중 점의 최소 시간(ms). 캐시로 바로 받아도 차례가 보이게 */
const RESULT_MIN_MS = 450;

type Entry =
  | { id: number; role: "me"; text: string }
  | { id: number; role: "bot"; text: string; note?: string }
  | { id: number; role: "result"; text: string; stores: MenuStore[] };

/** id를 뺀 말풍선(유니온마다 뺀다) */
type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

type Quick =
  | { kind: "menu" }
  | { kind: "after"; category: string; pool: MenuStore[] }
  | { kind: "pick"; categories: string[] }
  | { kind: "retry"; category: string }
  | null;

/** 칩이 하는 일. 칩은 이 값만 들고 누르면 Chat의 run이 처리한다 */
type Act =
  | { t: "pick"; category: string; clear?: boolean }
  | { t: "other" }
  | { t: "all"; category: string }
  | { t: "narrow"; only: "local" | "hoesik" };
type Chip = { label: string; act: Act; tone?: "quiet" | "go" };

type Region = { scope: HomeScope; near: boolean; title: string; queries: string[] };

function regionKey(r: Region): string {
  return JSON.stringify([scopeEntries(r.scope), r.near, r.queries]);
}

function FabIcon() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <ellipse cx="11" cy="9" rx="4" ry="5.5" fill="currentColor" />
      <rect x="9.9" y="13" width="2.2" height="15" rx="1.1" fill="currentColor" />
      <rect x="18.6" y="4" width="2" height="24" rx="1" fill="currentColor" />
      <rect x="23.4" y="4" width="2" height="24" rx="1" fill="currentColor" />
    </svg>
  );
}

/** 열려 있는 동안만 Esc 스택에 올린다(영수증 시트와 겹쳐도 맨 위 한 겹만 닫힌다) */
function EscapeWhileOpen({ onClose }: { onClose: () => void }) {
  useEscapeLayer(onClose);
  return null;
}

/**
 * 홈 우측 하단의 오늘 뭐먹지. app/page.tsx가 HomeView 옆에 둔다(HomeView가 지역마다 다시 그려져도 대화가 남게).
 * scope, near, title, queries는 서버가 조회한 지금 홈 지역이다(title: 상권 이름이나 동네, queries: 실제로 조회한 주소 범위).
 * 프랜차이즈 제외와 정렬은 주소(fr, s)가 정본이라 여기서 읽는다.
 */
export function TodayMenu(region: Region) {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const panelId = useId();

  const show = () => {
    setStarted(true);
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    fabRef.current?.focus();
  }, []);

  // 열리면 제목으로 포커스를 옮긴다(입력칸으로 옮기면 휴대폰 자판이 바로 올라온다).
  useEffect(() => {
    if (open) headRef.current?.focus();
  }, [open]);

  // 열린 동안 Tab이 패널 밖으로 나가지 않게 돌린다.
  const trap = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === headRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // 역, 장소 이름의 장소 검색이 실패해 조회 범위가 주소 꼴이 아니면 그리지 않는다(lib/today-menu.ts menuStoresUrl).
  if (!menuReady(region.scope, region.queries)) return null;

  return (
    <>
      <div className="tm-spacer" aria-hidden="true" />
      <button
        ref={fabRef}
        type="button"
        className="tm-fab"
        data-open={open ? "true" : undefined}
        aria-label="오늘 뭐먹지 열기"
        title="오늘 뭐먹지"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={started ? panelId : undefined}
        onClick={show}
      >
        <span className="tm-fab__icon">
          <FabIcon />
        </span>
      </button>
      {started ? (
        <>
          {open ? <EscapeWhileOpen onClose={close} /> : null}
          <button type="button" className="tm-scrim" data-open={open ? "true" : undefined} aria-label="닫기" tabIndex={-1} onClick={close} />
          <section
            ref={panelRef}
            id={panelId}
            className="tm-panel"
            data-open={open ? "true" : undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            inert={!open}
            onKeyDown={trap}
          >
            <div className="tm-bar">
              <span className="tm-grab" aria-hidden="true" />
              <h2 id={titleId} ref={headRef} tabIndex={-1} className="tm-title">
                오늘 뭐먹지
              </h2>
              <button type="button" className="tm-x" onClick={close} aria-label="닫기">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <Chat key={regionKey(region)} region={region} onLeave={close} />
          </section>
        </>
      ) : null}
    </>
  );
}

function Chat({ region, onLeave }: { region: Region; onLeave: () => void }) {
  const router = useRouter();
  const sp = useSearchParams();
  const exclude = sp.get("fr") !== "0";
  const sort = sp.get("s") === "rank" ? "rank" : "near";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [typing, setTyping] = useState(true);
  const [quick, setQuick] = useState<Quick>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);
  const alive = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const push = useCallback((...items: NewEntry[]) => {
    setEntries((prev) => [...prev, ...items.map((it) => ({ ...it, id: ++seq.current }) as Entry)]);
  }, []);

  // 처음 그리면 입력 중 점 뒤 인사와 분류 칩. 지운 뒤 늦게 오는 응답은 버린다.
  useEffect(() => {
    alive.current = true;
    const list = timers.current;
    list.push(
      window.setTimeout(() => {
        setTyping(false);
        push({ role: "bot", text: "오늘 뭐 먹을지 골라 볼까요? 메뉴를 누르거나 먹고 싶은 걸 적어 주세요.", note: `${region.title} 가게에서 찾아요.` });
        setQuick({ kind: "menu" });
        setBusy(false);
      }, TYPING_MS),
    );
    return () => {
      alive.current = false;
      for (const t of list) window.clearTimeout(t);
    };
  }, [push, region.title]);

  // 입력하는 동안에는 맞는 분류를 칩으로 보인다(맞는 것이 없으면 원래 칩).
  const said = text.replace(/\s+/g, " ").trim();
  const typed = said ? matchMenu(said) : [];
  // 분류 칩 전부는 여러 줄로 감는다(높이 상한과 세로 스크롤은 app/today-menu.css .tm-qr[data-wrap]). 나머지 칩은 한 줄 가로 스크롤.
  const wrap = quick?.kind === "menu" && typed.length === 0;

  // 새 말풍선이 붙거나 칩 영역이 여러 줄로 커지면(log가 줄어든다) 맨 아래로.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    log.scrollTo({ top: log.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [entries.length, typing, wrap]);

  const pick = (category: string, said: string = category) => {
    if (busy) return;
    setBusy(true);
    setQuick(null);
    push({ role: "me", text: said });
    setTyping(true);
    const url = menuStoresUrl(category, region.scope, region.queries);
    // 결과는 최소 RESULT_MIN_MS 뒤에 붙인다(캐시로 바로 받아도 입력 중 점이 보이게). 지운 뒤 늦게 오면 버린다.
    const wait = new Promise<void>((resolve) => later(resolve, RESULT_MIN_MS));
    const finish = (fn: () => void) => void wait.then(() => alive.current && fn());
    if (!url) {
      finish(() => {
        setTyping(false);
        push({ role: "bot", text: "지금 홈 지역을 알 수 없어요. 홈에서 지역을 고른 뒤 다시 열어 주세요." });
        setBusy(false);
      });
      return;
    }
    loadMenuStores(url).then(
      (stores) =>
        finish(() => {
          setTyping(false);
          const pool = filterMenuStores(stores, { exclude });
          if (pool.length === 0) {
            const text =
              stores.length > 0
                ? `${region.title} ${category} 가게는 프랜차이즈를 빼니 남는 곳이 없어요. 다른 분류를 골라 주세요.`
                : `${region.title}에서 ${category} 가게를 찾지 못했어요. 다른 분류를 골라 주세요.`;
            push({ role: "bot", text });
            setQuick({ kind: "menu" });
          } else {
            push({ role: "result", text: `${region.title} ${category} 매출 상위 가게예요`, stores: pool.slice(0, CARD_COUNT) });
            setQuick({ kind: "after", category, pool });
          }
          setBusy(false);
        }),
      () =>
        finish(() => {
          setTyping(false);
          push({ role: "bot", text: "가게를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요." });
          setQuick({ kind: "retry", category });
          setBusy(false);
        }),
    );
  };

  const reply = (said: string, bot: string, next: Quick) => {
    if (busy) return;
    setBusy(true);
    setQuick(null);
    push({ role: "me", text: said });
    setTyping(true);
    later(() => {
      if (!alive.current) return;
      setTyping(false);
      push({ role: "bot", text: bot });
      setQuick(next);
      setBusy(false);
    }, TYPING_MS);
  };

  const narrow = (q: Extract<Quick, { kind: "after" }>, only: Exclude<MenuFilter, null>) => {
    if (busy) return;
    const label = only === "local" ? "동네맛집" : "회식 적합";
    const hit = filterMenuStores(q.pool, { exclude: false, only });
    setBusy(true);
    setQuick(null);
    push({ role: "me", text: `${label}만` });
    setTyping(true);
    later(() => {
      if (!alive.current) return;
      setTyping(false);
      if (hit.length === 0) push({ role: "bot", text: `${region.title} ${q.category} 가게 중 ${label} 표시가 있는 곳은 없어요.` });
      else push({ role: "result", text: `${region.title} ${q.category} 가게 중 ${label} 표시가 있는 매출 상위 가게예요`, stores: hit.slice(0, CARD_COUNT) });
      setQuick(q);
      setBusy(false);
    }, RESULT_MIN_MS);
  };

  const viewAll = (category: string) => {
    onLeave();
    // 테마(t)는 풀고(그 분류 전체를 보게) 프랜차이즈 제외와 정렬은 지금 값을 잇는다.
    router.push(homeHref(region.scope, { near: region.near, q: category, excludeFranchise: exclude, sort }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!said || busy) return;
    setText("");
    const one = resolveMenu(said);
    if (one) return pick(one, said);
    const many = matchMenu(said);
    if (many.length > 0) reply(said, "이 분류 중에서 골라 주세요.", { kind: "pick", categories: many });
    else reply(said, "그 메뉴는 잇플 분류에 없어요. 아래 분류에서 골라 주세요.", { kind: "menu" });
  };

  // 칩은 값(Act)으로만 그리고, 누르면 run이 처리한다(렌더 중에 핸들러를 부르지 않는다).
  const run = (act: Act) => {
    if (act.t === "pick") pick(act.category);
    else if (act.t === "other") reply("다른 메뉴", "어떤 메뉴로 볼까요?", { kind: "menu" });
    else if (act.t === "all") viewAll(act.category);
    else if (quick?.kind === "after") narrow(quick, act.only);
  };

  const other: Chip = { label: "다른 메뉴", act: { t: "other" }, tone: "quiet" };
  let chips: Chip[] = [];
  if (typed.length > 0) chips = typed.map((c) => ({ label: c, act: { t: "pick", category: c, clear: true } }));
  else if (quick?.kind === "menu") chips = MENU_CHIPS.map((c): Chip => ({ label: c, act: { t: "pick", category: c } }));
  else if (quick?.kind === "pick") chips = [...quick.categories.map((c): Chip => ({ label: c, act: { t: "pick", category: c } })), other];
  else if (quick?.kind === "retry") chips = [{ label: "다시 찾기", act: { t: "pick", category: quick.category } }, other];
  else if (quick?.kind === "after")
    chips = [
      { label: "전체 보기", act: { t: "all", category: quick.category }, tone: "go" },
      other,
      { label: "동네맛집만", act: { t: "narrow", only: "local" } },
      { label: "회식 적합만", act: { t: "narrow", only: "hoesik" } },
    ];

  return (
    <>
      <div ref={logRef} className="tm-log" aria-live="polite" aria-relevant="additions">
        {entries.map((m) =>
          m.role === "me" ? (
            <div key={m.id} className="tm-msg tm-msg--me">
              <p className="tm-bub">{m.text}</p>
            </div>
          ) : m.role === "bot" ? (
            <div key={m.id} className="tm-msg">
              <p className="tm-bub">
                {m.text}
                {m.note ? <small>{m.note}</small> : null}
              </p>
            </div>
          ) : (
            <div key={m.id} className="tm-msg tm-msg--result">
              <p className="tm-bub">{m.text}</p>
              {m.stores.map((s, i) => (
                <MenuCard key={s.id} store={s} delay={(i + 1) * 120} />
              ))}
              <p className="tm-attr">{ATTRIBUTION}</p>
            </div>
          ),
        )}
        {typing ? (
          <div className="tm-msg" aria-hidden="true">
            <span className="tm-typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
      </div>
      <div className="tm-foot">
        {chips.length > 0 ? (
          <div className="tm-qr" data-wrap={wrap ? "true" : undefined} role="group" aria-label="빠른 답장">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                className={`chip tm-chip${c.tone ? ` tm-chip--${c.tone}` : ""}`}
                disabled={busy}
                onClick={() => {
                  if (c.act.t === "pick" && c.act.clear) setText("");
                  run(c.act);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        <form className="tm-form" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            먹고 싶은 메뉴
          </label>
          <input
            id={inputId}
            className="tm-input"
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={INPUT_MAX}
            placeholder="먹고 싶은 메뉴를 적어 주세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="tm-send" disabled={busy || !text.trim()}>
            보내기
          </button>
        </form>
      </div>
    </>
  );
}

function MenuCard({ store, delay }: { store: MenuStore; delay: number }) {
  const ranked = typeof store.ccgRank === "number" && Number.isFinite(store.ccgRank);
  return (
    <article className="tm-card" style={{ "--d": `${delay}ms` } as CSSProperties}>
      <p className="tm-card__name">{displayName(store.name)}</p>
      <p className="tm-card__rank">
        {ranked ? (
          <>
            {store.sigungu || "지역"} 매출 상위 <b className="num">{percentLabel(store.ccgRank)}</b>
          </>
        ) : (
          "매출 순위 미확인"
        )}
      </p>
      <p className="tm-card__tags">
        {store.category ? <span className="tm-tag">{store.category}</span> : null}
        {store.local === true ? <span className="tm-tag tm-tag--mark">동네맛집</span> : null}
        {store.hoesik === true ? <span className="tm-tag tm-tag--mark">회식 적합</span> : null}
      </p>
      <MerLink merUrl={store.merUrl} className="cta tm-card__cta" />
    </article>
  );
}
