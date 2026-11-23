// k-skill 프록시의 BC카드 잇플 검색 API.
// 이 모듈은 Next 전용 API를 import하지 않는다. 스크립트에서 그대로 부를 수 있게 둔다.

export const EATPL_ENDPOINT = "https://k-skill-proxy.nomadamas.org/v1/bccard-eatpl/search";
export const FETCH_TIMEOUT_MS = 5000;
export const REVALIDATE_SECONDS = 21600;

export type EatplItem = {
  merNm: string;
  merAddr: string;
  merTpno?: string;
  merTpbuzNm: string;
  allSaleRnk: number;
  ccgSaleRnk: number;
  loclPrsnPpltYn?: boolean;
  merUrl?: string;
  srtTime?: string;
  endTime?: string;
  frnrVsitYn?: boolean;
  empyVsitYn?: boolean;
  hldyDwk?: string[];
  congestionDwk?: string;
  congestionTizn?: string;
  vistCstmrRnkList?: Record<string, string>;
  xaxsVal?: string;
  yaxsVal?: string;
};

export type SearchParams = { location?: string; merTpbuzNm?: string; merNm?: string };

/** 검색 한 건. 실패하면 throw한다(호출 쪽에서 부분 실패로 센다). */
export type SearchFn = (params: SearchParams) => Promise<EatplItem[]>;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export function buildSearchUrl(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.location) qs.set("location", params.location);
  if (params.merTpbuzNm) qs.set("merTpbuzNm", params.merTpbuzNm);
  if (params.merNm) qs.set("merNm", params.merNm);
  return `${EATPL_ENDPOINT}?${qs.toString()}`;
}

/**
 * 검색 함수를 만든다. 서버에서 부르면 Next fetch 캐시가 revalidate초 동안 응답을 재사용한다.
 * 프록시는 클라이언트당 60회/60초 제한(코드 기본값)이다. 429는 실패로 치고 재시도하지 않는다.
 * 일반 Node에서 부르면 next 옵션은 무시된다. EATPL_LOG=1이면 실제 호출마다 한 줄 남긴다(검증용).
 */
export function createSearch(revalidate: number): SearchFn {
  return async (params) => {
    const url = buildSearchUrl(params);
    if (process.env.EATPL_LOG) console.log(`[eatpl] fetch ${url}`);
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate },
    } as RequestInit);
    if (!res.ok) throw new UpstreamError(`upstream ${res.status}`, res.status);
    const body = (await res.json()) as { items?: unknown };
    if (!Array.isArray(body.items)) throw new UpstreamError("upstream body without items");
    return body.items as EatplItem[];
  };
}

/** 결정기와 OG 카드가 쓰는 기본 검색(21600초, /area와 같은 6시간) */
export const searchEatpl: SearchFn = createSearch(REVALIDATE_SECONDS);
