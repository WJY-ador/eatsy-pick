// 내 방문 기록. 로그인 없이 이 기기의 localStorage에만 둔다.
// 규칙: 저장은 방문이 아니다. 잇플 링크 클릭은 기록하지 않는다. "다녀왔어요"를 직접 눌러야 방문이다.
// 반응(다시 갈래요, 다른 곳 볼래요)은 방문이 1회 이상일 때만 남길 수 있다.
// 단계, 태그, 메모는 저장한 매장을 사용자가 분류하는 값이다. 기기 밖(서버, 공유 링크, 주소)으로 내보내지 않는다.
// 저장소가 막힌 브라우저(사파리 비공개 모드 등)는 메모리에만 두고 persistent=false로 알린다.

import { useSyncExternalStore } from "react";
import type { Store } from "./stores";
import { type Occasion, isOccasion } from "./plan";

export { OCCASIONS, type Occasion } from "./plan";

// 키와 스키마 값을 바꾸지 않는다. parseVisits는 다른 스키마를 빈 상태로 읽어서, 값을 올리면 기존 저장이 전부 사라진다.
// 단계, 태그, 메모, 저장 때 순위, 단골 제안 닫음은 같은 스키마 1 위에 더한 필드다. 없거나 깨졌으면 읽을 때 기본값으로 채운다.
export const VISITS_KEY = "eatsy.visits.v1";
export const VISITS_SCHEMA = 1;

export type Reaction = "again" | "other";
export type Stage = "want" | "planned" | "regular" | "hold";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "want", label: "가고 싶은 곳" },
  { id: "planned", label: "방문 예정" },
  { id: "regular", label: "단골" },
  { id: "hold", label: "보류" },
];
/** 빠른 태그. 화면에는 #을 붙인다. */
export const QUICK_TAGS: string[] = ["회식", "데이트", "점심", "부모님"];
export const TAG_LEN_MAX = 12;
export const TAGS_MAX = 8;
export const MEMO_MAX = 80;
/** 다녀왔어요를 이만큼 눌렀고 단골도 보류도 아니면 단골로 옮길지 한 번 묻는다 */
export const REGULAR_ASK_VISITS = 3;
/** 단골인데 마지막 다녀왔어요 뒤 이 날수(KST 날짜) 이상 지나면 내 저장의 오래 안 간 단골에 묶는다 */
export const REGULAR_DORMANT_DAYS = 60;

/** 다음에 API 없이 다시 그릴 수 있게 Store 전체를 받아 둔다(merUrl 원문 포함). */
export type StoreSnapshot = Store;
export type VisitEntry = { at: string; occasion?: Occasion };
export type VisitRecord = {
  store: StoreSnapshot;
  /** 저장한 시각. 저장하지 않았거나 저장을 풀면 null. 저장 여부는 isSaved로 본다 */
  savedAt: string | null;
  visits: VisitEntry[];
  reaction: Reaction | null;
  updatedAt: string;
  /** 저장을 풀어도 남겨 두어, 다시 저장하면 되살린다 */
  stage: Stage;
  tags: string[];
  /** 한 줄 메모. 없으면 빈 문자열 */
  memo: string;
  /**
   * 처음 저장할 때의 지역 매출 순위(store.ccgRank). 다시 저장해도 바꾸지 않는다.
   * 이 칸이 생기기 전 기록, 그때 순위가 없던 매장, 지금 조회값이 아닌 사본으로 저장한 경우는 null이다(지어내지 않는다).
   */
  savedRank: number | null;
  /** 단골 제안을 닫았으면 true. 그 매장에는 다시 묻지 않는다 */
  regularAskClosed: boolean;
};
type Persisted = { schema: typeof VISITS_SCHEMA; records: Record<string, VisitRecord> };

export type VisitsSnapshot = {
  records: Readonly<Record<string, VisitRecord>>;
  /** false면 이 브라우저에서는 기록이 저장되지 않는다(메모리에만 있다) */
  persistent: boolean;
};

export const NOT_PERSISTENT_TEXT = "이 브라우저에서는 기록이 저장되지 않습니다";

const SERVER_SNAPSHOT: VisitsSnapshot = Object.freeze({ records: Object.freeze({}), persistent: true });

let snapshot: VisitsSnapshot | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${VISITS_KEY}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isBoolOrNull = (v: unknown) => v === null || typeof v === "boolean";
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";
const finiteOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function validStore(v: unknown): v is StoreSnapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  // customer1은 보지 않는다. 옛 스냅샷에는 없을 수 있고, 읽을 때 미확인(null)으로 채운다.
  return (
    isStr(s.id) &&
    s.id.length > 0 &&
    isStr(s.name) &&
    isStr(s.category) &&
    isStr(s.address) &&
    isStr(s.sigungu) &&
    (s.merUrl === null || (isStr(s.merUrl) && s.merUrl.startsWith("https://"))) &&
    isNumOrNull(s.ccgRank) &&
    isNumOrNull(s.allRank) &&
    isBoolOrNull(s.local) &&
    isBoolOrNull(s.hoesik) &&
    isBoolOrNull(s.foreign) &&
    isStrOrNull(s.peakDay) &&
    isStrOrNull(s.peakTime) &&
    Array.isArray(s.customers) &&
    s.customers.every(isStr) &&
    isStrOrNull(s.open) &&
    isStrOrNull(s.close) &&
    Array.isArray(s.holidays) &&
    s.holidays.every(isStr) &&
    isNumOrNull(s.lat) &&
    isNumOrNull(s.lng) &&
    typeof s.franchise === "boolean"
  );
}

export function isStage(v: unknown): v is Stage {
  return STAGES.some((s) => s.id === v);
}

/** 태그 하나를 정리한다. 앞뒤 공백과 맨 앞 #을 떼고 안쪽 공백을 없앤다. 빈 값이나 TAG_LEN_MAX를 넘는 값은 null */
export function normalizeTag(raw: string): string | null {
  const t = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!t || Array.from(t).length > TAG_LEN_MAX) return null;
  return t;
}

/** 태그 목록을 정리한다(정리, 빈 값 제거, 중복 제거, 최대 TAGS_MAX개). 순서는 붙인 순서다. */
export function cleanTags(list: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of list) {
    const t = typeof v === "string" ? normalizeTag(v) : null;
    if (t && !out.includes(t)) out.push(t);
    if (out.length === TAGS_MAX) break;
  }
  return out;
}

/** 메모를 한 줄로 정리한다. 줄바꿈과 연속 공백을 공백 하나로, 최대 MEMO_MAX자 */
export function cleanMemo(raw: string): string {
  return Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, MEMO_MAX).join("").trim();
}

/** 저장된 기록인지. 저장을 풀었지만 방문, 태그, 메모 때문에 남은 기록은 false */
export function isSaved(r: VisitRecord | undefined): boolean {
  return !!r && r.savedAt !== null;
}

/** 태그나 메모가 있는지(저장 해제 뒤 되돌리기, 삭제 흐름이 필요한지) */
export function hasNotes(r: VisitRecord | undefined): boolean {
  return !!r && (r.tags.length > 0 || r.memo !== "");
}

/** 지킬 것이 없는 기록(저장도, 방문도, 태그와 메모도 없음)은 두지 않는다 */
function keep(r: VisitRecord): VisitRecord | null {
  return isSaved(r) || r.visits.length > 0 || hasNotes(r) ? r : null;
}

/**
 * 기록 하나를 읽는다. 저장, 방문, 반응 필드가 깨졌으면 그 기록은 버린다.
 * 단계, 태그, 메모, 저장 때 순위, 단골 제안 닫음은 깨져도 그 필드만 기본값이나 정리된 값으로 바꾸고 기록은 살린다.
 */
function readRecord(v: unknown): VisitRecord | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!validStore(r.store)) return null;
  if (!isStrOrNull(r.savedAt) || !isStr(r.updatedAt)) return null;
  if (r.reaction !== null && r.reaction !== "again" && r.reaction !== "other") return null;
  if (!Array.isArray(r.visits)) return null;
  const visitsOk = r.visits.every(
    (e: unknown) =>
      !!e &&
      typeof e === "object" &&
      isStr((e as VisitEntry).at) &&
      ((e as VisitEntry).occasion === undefined || isOccasion((e as VisitEntry).occasion)),
  );
  if (!visitsOk) return null;
  // 방문 없는 반응은 규칙 위반이라 버린다.
  if (r.visits.length === 0 && r.reaction !== null) return null;
  const store = r.store as StoreSnapshot & { customer1?: unknown };
  return keep({
    store: { ...store, customer1: isStr(store.customer1) && store.customer1 ? store.customer1 : null },
    savedAt: r.savedAt as string | null,
    visits: r.visits as VisitEntry[],
    reaction: r.reaction as Reaction | null,
    updatedAt: r.updatedAt,
    stage: isStage(r.stage) ? r.stage : "want",
    tags: Array.isArray(r.tags) ? cleanTags(r.tags) : [],
    memo: isStr(r.memo) ? cleanMemo(r.memo) : "",
    savedRank: finiteOrNull(r.savedRank),
    regularAskClosed: r.regularAskClosed === true,
  });
}

/** 저장소 원문을 읽는다. 깨진 값, 다른 스키마는 빈 상태로 본다. 기록 하나가 깨졌으면 그 기록만 버린다. */
export function parseVisits(raw: string | null): Record<string, VisitRecord> {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object") return {};
  const p = data as Partial<Persisted>;
  if (p.schema !== VISITS_SCHEMA || !p.records || typeof p.records !== "object") return {};
  const out: Record<string, VisitRecord> = {};
  for (const [id, raw] of Object.entries(p.records)) {
    const rec = readRecord(raw);
    if (rec && rec.store.id === id) out[id] = rec;
  }
  return out;
}

function load(): VisitsSnapshot {
  const s = storage();
  if (!s) return { records: {}, persistent: false };
  let raw: string | null = null;
  try {
    raw = s.getItem(VISITS_KEY);
  } catch {
    return { records: {}, persistent: false };
  }
  return { records: parseVisits(raw), persistent: true };
}

function current(): VisitsSnapshot {
  if (!snapshot) snapshot = load();
  return snapshot;
}

function emit() {
  for (const l of listeners) l();
}

/** 기록을 바꾸고 저장한다. 쓰기가 실패하면 메모리에만 두고 persistent=false로 바꾼다. */
function commit(records: Record<string, VisitRecord>) {
  let persistent = current().persistent;
  if (persistent) {
    const s = storage();
    try {
      if (!s) throw new Error("no storage");
      if (Object.keys(records).length === 0) s.removeItem(VISITS_KEY);
      else s.setItem(VISITS_KEY, JSON.stringify({ schema: VISITS_SCHEMA, records } satisfies Persisted));
    } catch {
      persistent = false;
    }
  }
  snapshot = { records, persistent };
  emit();
}

function now(): string {
  return new Date().toISOString();
}

function update(id: string, fn: (r: VisitRecord | undefined) => VisitRecord | null) {
  const records = { ...current().records };
  const next = fn(records[id]);
  if (next === null) delete records[id];
  else records[id] = next;
  commit(records);
}

export type SaveOptions = {
  /** 이 시각으로 저장한다(저장 해제를 되돌릴 때 원래 저장 시각과 순서를 지킨다). 주면 저장 때 순위를 새로 찍지 않는다 */
  savedAt?: string;
  /** store가 지금 조회한 값인지. false(내 저장에 남은 사본 등)면 저장 때 순위를 찍지 않는다. 기본 true */
  live?: boolean;
  /** 기록이 지워진 뒤 되돌릴 때 함께 되살릴 값(남아 있는 기록이면 쓰지 않는다) */
  restore?: Pick<VisitRecord, "savedRank" | "regularAskClosed">;
};

/**
 * 저장. 방문으로 치지 않는다. 처음이면 가고 싶은 곳, 다시 저장하면 남아 있던 단계, 태그, 메모, 저장 때 순위를 되살린다.
 * 저장 때 순위는 저장되지 않은 상태에서 지금 조회값으로 저장할 때, 이미 찍힌 값이 없을 때만 찍는다.
 */
export function save(store: Store, { savedAt, live = true, restore }: SaveOptions = {}) {
  update(store.id, (r) => {
    const t = now();
    const stamp = savedAt === undefined && live && !isSaved(r) ? finiteOrNull(store.ccgRank) : null;
    if (r) return { ...r, store, savedAt: r.savedAt ?? savedAt ?? t, savedRank: r.savedRank ?? stamp, updatedAt: t };
    return {
      store,
      savedAt: savedAt ?? t,
      visits: [],
      reaction: null,
      updatedAt: t,
      stage: "want",
      tags: [],
      memo: "",
      savedRank: restore?.savedRank ?? stamp,
      regularAskClosed: restore?.regularAskClosed ?? false,
    };
  });
}

/** 저장 해제. 저장 시각만 지운다. 방문, 반응, 태그, 메모는 남기고, 남길 것이 없으면 기록 자체를 지운다. */
export function unsave(id: string) {
  update(id, (r) => (r ? keep({ ...r, savedAt: null, updatedAt: now() }) : null));
}

/** 저장된 기록에서 하나를 바꾼다. 저장되지 않았으면 무시한다. */
function editSaved(id: string, fn: (r: VisitRecord) => VisitRecord) {
  if (!isSaved(current().records[id])) return;
  update(id, (r) => (r && isSaved(r) ? { ...fn(r), updatedAt: now() } : (r ?? null)));
}

/** 단계를 바꾼다. 저장된 기록에만. 저장(북마크)은 그대로다. */
export function setStage(id: string, stage: Stage) {
  if (!isStage(stage)) return;
  editSaved(id, (r) => ({ ...r, stage }));
}

/** 태그를 바꾼다. 저장된 기록에만. 정리(공백, 중복, 빈 값, 상한)해서 둔다. */
export function setTags(id: string, tags: string[]) {
  editSaved(id, (r) => ({ ...r, tags: cleanTags(tags) }));
}

/** 단골 제안을 닫는다. 저장된 기록에만. 그 매장에는 다시 묻지 않는다. */
export function closeRegularAsk(id: string) {
  editSaved(id, (r) => ({ ...r, regularAskClosed: true }));
}

/** 단골로 옮길지 물을지. 저장했고, 다녀왔어요가 REGULAR_ASK_VISITS번 이상이고, 단골도 보류도 아니고, 닫지 않았을 때 */
export function shouldAskRegular(r: VisitRecord | undefined): boolean {
  return (
    !!r &&
    isSaved(r) &&
    r.visits.length >= REGULAR_ASK_VISITS &&
    r.stage !== "regular" &&
    r.stage !== "hold" &&
    !r.regularAskClosed
  );
}

/** 메모를 바꾼다. 저장된 기록에만. 한 줄로 정리하고 빈 값이면 지운다. */
export function setMemo(id: string, memo: string) {
  editSaved(id, (r) => ({ ...r, memo: cleanMemo(memo) }));
}

/** 태그와 메모를 지운다(저장 해제 뒤 명시적 삭제). 저장되지 않은 기록은 단계도 처음으로 돌리고, 남길 것이 없으면 기록을 지운다. */
export function deleteCrm(id: string) {
  update(id, (r) => {
    if (!r) return null;
    const next: VisitRecord = { ...r, tags: [], memo: "", updatedAt: now() };
    return isSaved(next) ? next : keep({ ...next, stage: "want" });
  });
}

/** "다녀왔어요"를 직접 눌렀을 때만 부른다. 방문 1회를 더한다. */
export function markVisited(store: Store, occasion?: Occasion) {
  update(store.id, (r) => {
    const t = now();
    const entry: VisitEntry = occasion ? { at: t, occasion } : { at: t };
    if (r) return { ...r, store, visits: [...r.visits, entry], updatedAt: t };
    return {
      store,
      savedAt: null,
      visits: [entry],
      reaction: null,
      updatedAt: t,
      stage: "want",
      tags: [],
      memo: "",
      savedRank: null,
      regularAskClosed: false,
    };
  });
}

/** 재방문 의향. 방문이 없으면 무시한다. null이면 반응을 지운다. */
export function setReaction(id: string, reaction: Reaction | null) {
  const r = current().records[id];
  if (!r || r.visits.length === 0) return;
  update(id, (rec) => (rec ? { ...rec, reaction, updatedAt: now() } : null));
}

/** 가장 최근 방문의 모임 유형을 바꾼다. null이면 유형을 지운다. 방문이 없으면 무시한다. */
export function setOccasion(id: string, occasion: Occasion | null) {
  const r = current().records[id];
  if (!r || r.visits.length === 0) return;
  update(id, (rec) => {
    if (!rec) return null;
    const visits = [...rec.visits];
    let last = 0;
    visits.forEach((v, i) => {
      if (v.at >= visits[last].at) last = i;
    });
    visits[last] = occasion ? { at: visits[last].at, occasion } : { at: visits[last].at };
    return { ...rec, visits, updatedAt: now() };
  });
}

/** 방문과 반응만 지운다. 저장, 태그, 메모는 남긴다. 남길 것이 없으면 기록 자체를 지운다. */
export function clearVisits(id: string) {
  update(id, (r) => (r ? keep({ ...r, visits: [], reaction: null, updatedAt: now() }) : null));
}

/** 전체 삭제 */
export function clearAll() {
  commit({});
}

/** 최근에 바뀐 순 */
export function sortRecords(records: Readonly<Record<string, VisitRecord>>): VisitRecord[] {
  return Object.values(records).sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt < b.updatedAt ? 1 : -1));
}

function onStorage(e: StorageEvent) {
  // 다른 탭에서 바꾼 기록을 반영한다. key가 null이면 저장소 전체가 비워진 것이다.
  if (e.key !== null && e.key !== VISITS_KEY) return;
  snapshot = load();
  emit();
}

function subscribe(cb: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** 전체 기록과 저장 가능 여부. 서버와 첫 수화에서는 빈 상태다. */
export function useVisits(): VisitsSnapshot {
  return useSyncExternalStore(subscribe, current, () => SERVER_SNAPSHOT);
}

/** 매장 하나의 기록 */
export function useVisitRecord(id: string): VisitRecord | undefined {
  return useVisits().records[id];
}
