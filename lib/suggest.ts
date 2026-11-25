// 머리말 검색 자동완성(components/home/HeaderSearch.tsx). 기기 안 목록과 서버 장소를 한 목록(최대 SUGGEST_MAX)으로 합친다.
// 기기 안(호출 없음): 프리셋 상권(이름, 역 이름, 별칭), 내 상권 목록의 직접 추가 지역, 음식어, 지역 + 음식 조합.
// 서버: GET /api/suggest(카카오 키워드 검색 1건, 맨 지명에 역이 없으면 역 분류로 1건 더. 서버 하루 캐시, 브라우저 1시간 캐시). serverQuery가 null이 아닐 때만 부른다.
// 항목 글자를 그대로 제출한다(홈과 맛집 둘러보기의 기존 제출 경로). 그래서 parseHome이 의도한 갈래로 읽는 꼴만 낸다.
//   역은 역 이름만(시도를 붙이면 가게 이름 검색이 된다), 조합은 splitRegionFood가 나누는 것만,
//   내 상권의 동은 시도를 뗀 주소(송파구 잠실동. 동 이름만 보내면 맨 낱말 풀이가 다른 동명 지역을 고를 수 있다).
// 순서: 기기 안 항목(조합, 앞부분 일치, 중간 일치) 다음에 서버 항목을 붙인다. 서버 응답이 와도 앞 행의 순서는 바뀌지 않는다.
// 서버를 부르는 입력이면 기기 안 항목은 LOCAL_MAX까지만 둔다(장소 자리를 남긴다).
// 이 모듈은 클라이언트와 서버가 같이 쓴다. Next 전용 API, React, process.env를 쓰지 않는다.

import { AREAS } from "./areas";
import { FOOD_WORDS, foodCategory } from "./food";
import { Q_MAX, isAddressLike, presetFor, splitRegionFood } from "./home-params";
import type { CustomArea } from "./my-areas";

export type SuggestKind = "area" | "station" | "region" | "place" | "food";
/** 자동완성 항목. text를 그대로 제출한다 */
export type Suggestion = { text: string; kind: SuggestKind };
/** 화면 목록 한 줄. key는 갈 곳이 같은 항목을 하나로 합치는 열쇠다 */
export type SuggestRow = Suggestion & { key: string };

/** 항목 끝의 짧은 종류 표시 */
export const SUGGEST_LABEL: Record<SuggestKind, string> = { area: "상권", station: "역", region: "지역", place: "장소", food: "음식" };
export const SUGGEST_MAX = 8;
const LOCAL_MAX = 5;
/** 서버 장소 검색 입력: 공백 뺀 글자 수 하한과 전체 길이 상한(서버 경로도 같은 값으로 자른다) */
export const SUGGEST_MIN = 2;
export const SUGGEST_QUERY_MAX = 30;
/** 입력이 멈춘 뒤 서버를 부르기까지(ms) */
export const SUGGEST_DEBOUNCE_MS = 250;

const compact = (s: string) => s.replace(/\s+/g, "");
/** 홀로 선 자모(ㅅ, ㅐ). 조합 중간 상태라 서버로 보내지 않는다 */
const JAMO = /[ㄱ-ㆎ]/;
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

function syllable(ch: string): number | null {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? c : null;
}

/** 조합 중일 수 있는 마지막 글자 q가 글자 t로 이어지는가(ㄱ → 고, 고 → 곱) */
function leads(q: string, t: string): boolean {
  if (q === t) return true;
  const tc = syllable(t);
  if (tc === null) return false;
  if (q === CHO[Math.floor(tc / 588)]) return true;
  const qc = syllable(q);
  return qc !== null && qc % 28 === 0 && Math.floor(qc / 28) === Math.floor(tc / 28);
}

/** 일치 정도: 0 앞부분, 1 중간, -1 없음. q는 공백을 뗀 입력이고 마지막 글자는 조합 중일 수 있다 */
function matchRank(text: string, q: string): number {
  const t = compact(text);
  if (!q) return -1;
  if (t.startsWith(q) || (t.length >= q.length && t.startsWith(q.slice(0, -1)) && leads(q.slice(-1), t[q.length - 1]))) return 0;
  return t.includes(q) ? 1 : -1;
}

/** 갈 곳이 같은 글자를 하나로 본다(잠실과 잠실역, 고기와 고깃집, 잠실 고기와 잠실역 고깃집) */
export function destKey(text: string): string {
  const slug = presetFor(text);
  if (slug) return `area:${slug}`;
  const food = foodCategory(text);
  if (food) return `food:${food}`;
  const sp = splitRegionFood(text);
  if (sp) return `combo:${presetFor(sp.region) ?? compact(sp.region)}:${sp.food}`;
  return `text:${compact(text)}`;
}

/** 내 상권 항목의 제출 글자. 동은 시도를 뗀 주소(주소 꼴일 때), 그 밖은 이름 */
function customText(c: CustomArea): string {
  if (c.level !== "dong") return c.name;
  const tokens = c.address.trim().split(/\s+/).slice(1);
  const text = tokens.join(" ");
  return tokens.length >= 2 && isAddressLike(text) ? text : c.name;
}

/** 기기 안 항목(호출 없음). 조합, 앞부분 일치, 중간 일치 순이고 같은 순위는 상권, 내 상권, 음식 순 */
export function localSuggest(input: string, custom: CustomArea[]): SuggestRow[] {
  const q = compact(input);
  if (!q) return [];
  const rows: (SuggestRow & { r: number })[] = [];
  // 지역 + 음식: 마지막 낱말이 음식어(조합 중이면 그 앞부분)이고 앞이 지역 표현일 때(잠실 고 → 잠실 고기)
  const tokens = input.trim().split(/\s+/);
  if (tokens.length >= 2) {
    const front = tokens.slice(0, -1).join(" ");
    const last = tokens[tokens.length - 1];
    for (const w of FOOD_WORDS) {
      const text = `${front} ${w}`;
      if (matchRank(w, last) === 0 && splitRegionFood(text)) rows.push({ text, kind: "food", key: destKey(text), r: -1 });
    }
  }
  for (const a of AREAS) {
    let best: { text: string; r: number } | null = null;
    for (const f of [a.name, a.centerName, ...a.aliases]) {
      const r = matchRank(f, q);
      if (r >= 0 && (!best || r < best.r)) best = { text: f, r };
    }
    if (best) rows.push({ text: best.text, kind: "area", key: `area:${a.slug}`, r: best.r });
  }
  for (const c of custom) {
    const text = customText(c);
    const rs = [matchRank(c.name, q), matchRank(text, q)].filter((x) => x >= 0);
    const r = rs.length ? Math.min(...rs) : -1;
    if (r >= 0) rows.push({ text, kind: c.kind === "station" ? "station" : "region", key: destKey(text), r });
  }
  for (const w of FOOD_WORDS) {
    const r = matchRank(w, q);
    if (r >= 0) rows.push({ text: w, kind: "food", key: destKey(w), r });
  }
  const seen = new Set<string>();
  const out: SuggestRow[] = [];
  for (const { text, kind, key } of rows.sort((x, y) => x.r - y.r)) {
    if (text.length > Q_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, kind, key });
  }
  return out;
}

/**
 * 서버 장소 검색에 보낼 입력. 공백을 하나로 줄인 입력이고, 못 보내면 null.
 * 보내지 않는 때: 공백 뺀 2자 미만, 상한 초과, 홀로 선 자모(조합 중간), 음식어로 끝남(고기, 잠실 고기는 음식 검색이다).
 */
export function serverQuery(input: string): string | null {
  const q = input.replace(/\s+/g, " ").trim();
  if (compact(q).length < SUGGEST_MIN || q.length > SUGGEST_QUERY_MAX || JAMO.test(q)) return null;
  if (foodCategory(q.split(" ").pop() ?? "")) return null;
  return q;
}

/** 기기 안 항목 뒤에 서버 항목을 붙인다. withServer면 기기 안 항목을 LOCAL_MAX까지만 둔다 */
export function mergeSuggest(local: SuggestRow[], server: Suggestion[] | undefined, withServer: boolean): SuggestRow[] {
  const out = local.slice(0, withServer ? LOCAL_MAX : SUGGEST_MAX);
  const seen = new Set(out.map((r) => r.key));
  for (const s of server ?? []) {
    if (out.length >= SUGGEST_MAX) break;
    const key = destKey(s.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, key });
  }
  return out;
}

// ---------- 서버 장소 받기(브라우저) ----------

const MEMO_MAX = 100;
/** 입력별 서버 항목(브라우저 메모리, 세션 동안). 성공한 응답만 담는다 */
const memo = new Map<string, Suggestion[]>();

export function peekSuggest(q: string): Suggestion[] | undefined {
  return memo.get(q);
}

function isServerItem(v: unknown): v is Suggestion {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.text === "string" && o.text.length > 0 && o.text.length <= Q_MAX && (o.kind === "station" || o.kind === "place");
}

/** 서버 장소를 받아 memo에 담는다. 담았으면 true. 실패와 끊김은 false이고 담지 않는다. 브라우저에서만 부른다 */
export async function loadSuggest(q: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`/api/suggest?${new URLSearchParams({ q }).toString()}`, { signal });
    if (!res.ok) return false;
    const body = (await res.json()) as { items?: unknown; failed?: unknown };
    if (body.failed || !Array.isArray(body.items)) return false;
    if (memo.size >= MEMO_MAX) {
      const old = memo.keys().next().value;
      if (old !== undefined) memo.delete(old);
    }
    memo.set(q, body.items.filter(isServerItem));
    return true;
  } catch {
    return false;
  }
}
