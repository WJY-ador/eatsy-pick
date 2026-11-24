// 리스트 공유. 서버 저장소가 없으므로 목록을 링크(/list?d=...) 안에 담는다.
// 담는 값은 허용 목록으로 새로 만든다: 제목, 매장별 가게명, 업종, 주소, 시군구, 지역 매출 상위 %, 원본 merUrl.
// 단계, 태그, 메모, 방문 이력, 반응, 약속 종류, 위치 좌표는 넣지 않는다(VisitRecord에서 지우는 방식으로 만들지 않는다. Store만 받는다).
// 읽을 때는 링크를 믿지 않는다. 항목마다 검사하고 깨진 항목만 버린다. merUrl은 받은 문자열 그대로 MerLink에 넘긴다.
// 이 모듈은 Next 전용 API와 Node 모듈을 import하지 않는다(클라이언트와 서버가 같이 쓴다). 압축 풀기는 서버가 넘긴다.

import type { Store } from "./stores";

/** 한 목록에 담을 수 있는 매장 수 */
export const SHARE_MAX_STORES = 30;
/** 제목 글자 수 상한 */
export const SHARE_TITLE_MAX = 40;
/** 링크의 d 값 길이 상한. 넘으면 읽지 않는다 */
export const SHARE_PARAM_MAX = 16000;
/** 압축을 풀었을 때의 바이트 상한 */
export const SHARE_JSON_MAX = 64 * 1024;
/** 제목이 없거나 깨졌을 때 */
export const SHARE_DEFAULT_TITLE = "저장 목록";

const MER_URL_RE = /^https:\/\/web\.paybooc\.ai\/mer\/web\/profile\/[A-Za-z0-9_-]+$/;
const MER_URL_MAX = 200;
const NAME_MAX = 60;
const CATEGORY_MAX = 30;
const ADDRESS_MAX = 120;
const SIGUNGU_MAX = 20;
/** 읽을 때 살펴볼 항목 수 상한(그 뒤는 보지 않고 버린 것으로 센다) */
const SCAN_MAX = 200;
// 제어 문자와 줄바꿈이 섞인 값은 버린다.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** 공유 목록의 매장 하나. 공개 정보만 있다 */
export type SharedStore = {
  name: string;
  category: string;
  address: string;
  sigungu: string;
  /** 지역(시군구) 매출 상위 %. 원본 수치, 없으면 null */
  ccgRank: number | null;
  /** 잇플 상세 원본 주소. 받은 문자열 그대로 쓴다 */
  merUrl: string;
};

export type SharedList = { title: string; stores: SharedStore[]; dropped: number };

/** 링크에 담는 꼴. 짧게 하려고 매장은 배열로 둔다: [가게명, 업종, 주소, 시군구, 지역 매출 상위 %, merUrl] */
type Payload = { v: 1; t: string; s: [string, string, string, string, number | null, string][] };

/** 공유 목록에 넣을 수 있는 잇플 주소인지(이 꼴이 아니면 공유에서 빠진다) */
export function isShareableMerUrl(v: unknown): v is string {
  return typeof v === "string" && v.length <= MER_URL_MAX && MER_URL_RE.test(v);
}

/** 이 매장을 공유 목록에 넣을 수 있는지 */
export function canShareStore(store: Pick<Store, "merUrl">): boolean {
  return isShareableMerUrl(store.merUrl);
}

function text(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < min || t.length > max || CONTROL_RE.test(t)) return null;
  return t;
}

function rank(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) return v;
  return undefined;
}

/** 제목 정리: 앞뒤 공백을 빼고, 비었거나 깨졌으면 기본 제목 */
export function cleanTitle(v: unknown): string {
  return text(v, 1, SHARE_TITLE_MAX) ?? SHARE_DEFAULT_TITLE;
}

/** 공유할 값을 허용 목록으로 새로 만든다. 공유할 수 없는 매장(잇플 주소가 없거나 다른 꼴)은 빠진다 */
function payloadOf(title: string, stores: Store[]): Payload {
  const s: Payload["s"] = [];
  const seen = new Set<string>();
  for (const st of stores) {
    if (s.length >= SHARE_MAX_STORES) break;
    if (!isShareableMerUrl(st.merUrl) || seen.has(st.merUrl)) continue;
    const name = text(st.name, 1, NAME_MAX);
    if (!name) continue;
    seen.add(st.merUrl);
    s.push([
      name,
      text(st.category, 0, CATEGORY_MAX) ?? "",
      text(st.address, 0, ADDRESS_MAX) ?? "",
      text(st.sigungu, 0, SIGUNGU_MAX) ?? "",
      rank(st.ccgRank) ?? null,
      st.merUrl,
    ]);
  }
  return { v: 1, t: cleanTitle(title), s };
}

/** 링크에 담기는 매장 수(공유할 수 없는 매장과 상한 초과분을 뺀 수) */
export function shareableCount(stores: Store[]): number {
  return payloadOf("", stores).s.length;
}

// ---------- base64url ----------

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * 공유 링크의 d 값을 만든다. 압축할 수 있으면 "z" + 압축본, 아니면 "j" + JSON 원문(둘 다 base64url).
 * 담기는 매장이 0곳이거나 링크가 SHARE_PARAM_MAX보다 길면 null.
 */
export async function encodeSharedList(title: string, stores: Store[]): Promise<string | null> {
  const payload = payloadOf(title, stores);
  if (payload.s.length === 0) return null;
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const z = await deflate(json);
  const d = z && z.length < json.length ? `z${toB64url(z)}` : `j${toB64url(json)}`;
  // 읽는 쪽이 받지 않는 길이의 링크는 만들지 않는다.
  return d.length <= SHARE_PARAM_MAX ? d : null;
}

/** 공유 목록 주소(사이트 기준 경로) */
export function sharedListPath(d: string): string {
  return `/list?d=${d}`;
}

/** 압축을 푼 JSON을 검사한다. 목록 꼴이 아니면 null, 항목은 하나씩 검사해 깨진 것만 버린다 */
export function parseSharedPayload(data: unknown): SharedList | null {
  if (!data || typeof data !== "object") return null;
  const p = data as Record<string, unknown>;
  if (p.v !== 1 || !Array.isArray(p.s)) return null;
  const stores: SharedStore[] = [];
  const seen = new Set<string>();
  const scan = p.s.slice(0, SCAN_MAX);
  for (const it of scan) {
    if (stores.length >= SHARE_MAX_STORES) break;
    if (!Array.isArray(it) || it.length !== 6) continue;
    const [n, c, a, g, r, u] = it as unknown[];
    const name = text(n, 1, NAME_MAX);
    const category = text(c, 0, CATEGORY_MAX);
    const address = text(a, 0, ADDRESS_MAX);
    const sigungu = text(g, 0, SIGUNGU_MAX);
    const ccgRank = rank(r);
    if (name === null || category === null || address === null || sigungu === null || ccgRank === undefined) continue;
    if (!isShareableMerUrl(u) || seen.has(u)) continue;
    seen.add(u);
    stores.push({ name, category, address, sigungu, ccgRank, merUrl: u });
  }
  return { title: cleanTitle(p.t), stores, dropped: p.s.length - stores.length };
}

/**
 * 링크의 d 값을 읽는다. inflateRaw는 압축본을 푸는 함수다(서버가 넘긴다, 상한을 넘거나 깨졌으면 null).
 * 길이 초과, 깨진 인코딩, 목록 꼴이 아니면 null.
 */
export function decodeSharedList(d: unknown, inflateRaw: (bytes: Uint8Array) => Uint8Array | null): SharedList | null {
  if (typeof d !== "string" || d.length < 2 || d.length > SHARE_PARAM_MAX) return null;
  const bytes = fromB64url(d.slice(1));
  if (!bytes) return null;
  let json: Uint8Array | null;
  if (d[0] === "z") json = inflateRaw(bytes);
  else if (d[0] === "j") json = bytes;
  else return null;
  if (!json || json.length > SHARE_JSON_MAX) return null;
  try {
    return parseSharedPayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)));
  } catch {
    return null;
  }
}
