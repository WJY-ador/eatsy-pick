/**
 * 768px 미만 상단 바 접기. 아래로 스크롤하면 로고와 메뉴 줄을 위로 숨기고 검색창 줄만 남긴다. 위로 조금 스크롤하면 다시 펼친다.
 * 상태는 html[data-top-folded]와 --top-fold(숨기는 높이)로 CSS에 넘긴다. 상단 바의 transform만 바뀌므로 문서 높이와 본문 위치는 그대로다.
 * 지도 보기처럼 코드가 스크롤하는 동작은 holdTop으로 상태를 먼저 정하고, 그 스크롤이 끝날 때까지 상태를 바꾸지 않는다.
 * 높이는 화면 좌표(전환 중에는 중간값)가 아니라 상태로 계산한다.
 */

/** 접기를 쓰는 폭. CSS의 @media (max-width: 47.99rem)과 같다 */
export const TOP_FOLD_MQ = "(max-width: 767.98px)";
/** 같은 방향으로 이만큼 내려가야 접는다(작은 흔들림으로 깜빡이지 않게) */
const FOLD_PX = 24;
/** 같은 방향으로 이만큼 올라가면 펼친다 */
const UNFOLD_PX = 12;
/** holdTop이 상태를 묶어 두는 최소 시간. 지도 보기의 바로잡기(최대 1200ms 뒤)보다 길다 */
const HOLD_MS = 1500;
/** 묶인 동안 스크롤이 이어지면 마지막 스크롤 뒤 이만큼 더 묶는다 */
const HOLD_TAIL_MS = 250;

let folded = false;
let foldPx = 0;
let holdUntil = 0;
let lastY = 0;
let acc = 0;

function header(): HTMLElement | null {
  return document.querySelector<HTMLElement>("header.top");
}

/** 지금 폭에서 접기를 쓰는지 */
export function topFoldable(): boolean {
  return typeof window !== "undefined" && window.matchMedia(TOP_FOLD_MQ).matches && !!header();
}

/** 고정 머리말(상단 바)이 지금 상태에서 가리는 높이. 768px 이상이거나 상단 바가 없으면 null */
export function topStuck(): number | null {
  const h = header();
  if (!h || !window.matchMedia(TOP_FOLD_MQ).matches) return null;
  return Math.round(Math.max(0, h.offsetHeight - (folded ? foldPx : 0)));
}

function apply(next: boolean, instant: boolean) {
  const h = header();
  folded = next;
  acc = 0;
  const root = document.documentElement;
  if (!h) {
    root.removeAttribute("data-top-folded");
    return;
  }
  if (instant) h.style.transition = "none";
  root.toggleAttribute("data-top-folded", next);
  if (instant) {
    // 전환 없이 바로 그 자리에 두고(스타일을 한 번 계산시킨 뒤) 전환을 되살린다.
    void getComputedStyle(h).transform;
    h.style.transition = "";
  }
}

/**
 * 코드가 스크롤하기 전에 부른다. fold가 true면 바로 접고, false면 바로 펼치고, 빼면 지금 상태 그대로 둔다.
 * 그 스크롤이 끝날 때까지(최소 1.5초, 사용자가 화면을 만지면 바로 풀림) 스크롤 방향으로 상태를 바꾸지 않는다.
 * 그 상태에서 고정 머리말이 가리는 높이를 돌려준다. 768px 이상이면 아무것도 하지 않고 null.
 */
export function holdTop(fold?: boolean): number | null {
  if (!topFoldable()) return null;
  if (fold !== undefined && fold !== folded) apply(fold, true);
  holdUntil = performance.now() + HOLD_MS;
  return topStuck();
}

function release() {
  holdUntil = 0;
  lastY = clampY();
  acc = 0;
}

function clampY(): number {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(Math.max(window.scrollY, 0), max);
}

/** 접으면 안 되는 때: 상단 바 안에 초점(검색창 입력 등), 시트, 영수증, 목록 팝업이 열림 */
function blocked(h: HTMLElement): boolean {
  const a = document.activeElement;
  if (a && a !== document.body && h.contains(a)) return true;
  return !!document.querySelector('aside.rc, aside.sheet, [role="listbox"]');
}

function measure(h: HTMLElement) {
  const inner = h.querySelector<HTMLElement>(".top__in");
  const search = h.querySelector<HTMLElement>(".top__search");
  const root = document.documentElement;
  if (inner && search) {
    // 검색창 줄 위까지 숨긴다. 위 여백은 남긴다(상단 바는 position: sticky라 검색창의 offsetParent다).
    const pad = Number.parseFloat(getComputedStyle(inner).paddingTop) || 0;
    foldPx = Math.max(0, Math.round(search.offsetTop - pad));
  } else foldPx = 0;
  root.style.setProperty("--top-fold", `${foldPx}px`);
  root.style.setProperty("--top-h", `${h.offsetHeight}px`);
}

/** SiteHeader가 부른다. 스크롤(passive, 프레임당 한 번), 크기, 폭, 초점, 사용자 입력을 듣는다. 끄는 함수를 돌려준다 */
export function startTopFold(): () => void {
  const h = header();
  if (!h) return () => {};
  const mq = window.matchMedia(TOP_FOLD_MQ);
  let frame = 0;
  lastY = clampY();
  acc = 0;

  const onFrame = () => {
    frame = 0;
    const y = clampY();
    if (!mq.matches) {
      if (folded) apply(false, true);
      lastY = y;
      return;
    }
    const now = performance.now();
    if (holdUntil) {
      if (now < holdUntil) {
        holdUntil = Math.max(holdUntil, now + HOLD_TAIL_MS);
        lastY = y;
        return;
      }
      release();
      return;
    }
    const d = y - lastY;
    lastY = y;
    // 페이지 맨 위 근처는 늘 펼친다. 화면보다 크게 뛴 경우(맨 위로 이동 등)는 전환 없이 펼친다.
    if (y <= h.offsetHeight) {
      if (folded) apply(false, Math.abs(d) > window.innerHeight);
      return;
    }
    if (d === 0) return;
    if (Math.sign(d) !== Math.sign(acc)) acc = 0;
    acc += d;
    if (!folded && acc >= FOLD_PX) {
      if (blocked(h)) acc = 0;
      else apply(true, false);
    } else if (folded && acc <= -UNFOLD_PX) apply(false, Math.abs(d) > window.innerHeight);
  };
  const onScroll = () => {
    if (!frame) frame = window.requestAnimationFrame(onFrame);
  };
  // 접힌 채로 로고나 메뉴에 초점이 가면 펼친다(검색창 줄은 접혀도 보인다).
  const onFocus = (e: FocusEvent) => {
    if (folded && e.target instanceof Node && !h.querySelector(".top__search")?.contains(e.target)) apply(false, false);
  };
  // 사용자가 화면을 만지면 holdTop의 묶음을 푼다.
  const onInput = () => {
    if (holdUntil) release();
  };
  const onMq = () => {
    if (!mq.matches && folded) apply(false, true);
    measure(h);
    lastY = clampY();
  };
  measure(h);
  const ro = new ResizeObserver(() => measure(h));
  ro.observe(h);
  window.addEventListener("scroll", onScroll, { passive: true });
  h.addEventListener("focusin", onFocus);
  for (const t of ["touchstart", "wheel", "keydown"] as const) window.addEventListener(t, onInput, { passive: true });
  mq.addEventListener("change", onMq);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    ro.disconnect();
    window.removeEventListener("scroll", onScroll);
    h.removeEventListener("focusin", onFocus);
    for (const t of ["touchstart", "wheel", "keydown"] as const) window.removeEventListener(t, onInput);
    mq.removeEventListener("change", onMq);
    apply(false, true);
    holdUntil = 0;
  };
}
