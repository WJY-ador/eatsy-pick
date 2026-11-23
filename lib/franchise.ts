// 프랜차이즈 판정. 브랜드와 별칭은 lib/brands.ts 한 곳에만 둔다. 이 파일은 규칙만 갖는다.
// BC카드 응답에는 브랜드나 체인 식별 필드가 없다(2026-11-23 확인, 필드 18개). 그래서 상호로 판정한다.
//
// 판정 규칙(별칭은 공백, 기호를 지우고 소문자로 맞춘 꼴로 비교한다)
// 1. 상호를 슬래시로 나눈 조각마다 본다("씨제이푸드빌(주)/빕스판교점"처럼 브랜드가 슬래시 뒤에 올 수 있다).
// 2. 조각에서 법인 표기((주), ㈜, (유), 주식회사, 유한회사)와 괄호를 지우고 낱말로 나눈다.
// 3. 별칭 길이로 엄격도를 정한다. 따로 표시하는 목록은 두지 않는다.
//    - 짧은 별칭(2자 이하: 공차, 본죽, 놀부, 설빙, 빕스 등): 첫 낱말이 별칭과 같거나,
//      첫 낱말이 별칭 + 지점 표기(…점, …호점)일 때만. 이름 중간이나 뒤에 붙은 경우는 보지 않는다.
//    - 3자 이상 공통: 첫 낱말이 별칭과 같거나, 뒤쪽 낱말이 별칭과 같고 그 앞이나 뒤 낱말이 지점 표기일 때
//      ("성수역점 써브웨이"는 체인, "텍사스 BBQ"는 아님).
//    - 3자: 위에 더해, 이름이 별칭으로 시작하고 뒤가 비었거나 지점 표기이거나 숫자일 때("커피빈집"은 아님).
//    - 4자 이상: 위에 더해, 이름이 별칭으로 시작할 때. 또 이름 중간에 붙어 있어도
//      별칭 뒤가 비었거나 지점 표기로 끝나면("홍대한신포차").
// 4. "점", "직영점", "본점", "카페" 같은 일반 문자열만으로는 판정하지 않는다(예전의 이름 끝 "직영점" 규칙은 없앴다).
// 5. 업종이 푸드코트면 체인으로 본다(예전 규칙 유지).

import { BRANDS } from "./brands";

const CORP = /\(주\)|㈜|\(유\)|\(사\)|주식회사|유한회사|주식회(?=$|[\s/)])/g;

/** NFKC(전각 → 반각), 소문자 */
function base(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** 비교용 압축: 공백과 기호를 지운다(한글, 영문, 숫자만 남긴다) */
function compact(s: string): string {
  return base(s).replace(/[^0-9a-z가-힣]/g, "");
}

/**
 * 상호 정규화(중복 정리 키에도 쓰인다).
 * 법인 표기를 떼고, 슬래시로 붙은 법인명 조각을 버리고, 영문만 든 괄호(영문 병기)를 지우고,
 * 남은 괄호 기호와 공백을 지우고 소문자로 맞춘다. 전각 문자는 반각으로 바꾼다.
 */
export function normalizeName(name: string): string {
  const parts = base(name).split("/");
  // 슬래시 조각 중 법인 표기가 든 조각은 버린다(다른 조각이 남을 때만).
  const kept = parts.length > 1 ? parts.filter((p) => !/\(주\)|㈜|\(유\)|주식회사|유한회사|주식회/.test(p)) : parts;
  const s = (kept.length > 0 ? kept : parts).join("/");
  return s
    .replace(CORP, "")
    .replace(/\(\s*[a-z0-9&.'\s-]+\s*\)/g, "")
    .replace(/[\s()[\]{}<>]/g, "");
}

type Alias = { brand: string; alias: string; key: string };

const ALIASES: Alias[] = BRANDS.flatMap((b) =>
  [b.name, ...b.aliases].map((alias) => ({ brand: b.name, alias, key: compact(alias) })),
)
  .filter((a) => a.key.length > 0)
  // 긴 별칭부터 본다(투썸플레이스가 투썸보다 먼저)
  .sort((a, b) => b.key.length - a.key.length);

/** 지점 표기: …점, …지점, …호점, …역점, …직영점, dt점 등 "점"으로 끝나는 짧은 꼬리 */
const BRANCH = /^[0-9a-z가-힣]{0,20}점$/;

function isBranchToken(t: string | undefined): boolean {
  return typeof t === "string" && t.length >= 2 && t.endsWith("점");
}

function fragments(name: string): string[][] {
  return base(name)
    .split("/")
    .map((frag) =>
      frag
        .replace(CORP, " ")
        .replace(/[()[\]{}<>]/g, " ")
        .split(/[^0-9a-z가-힣]+/)
        .filter((t) => t.length > 0),
    )
    .filter((tokens) => tokens.length > 0);
}

function matchTokens(tokens: string[], a: Alias): boolean {
  const k = a.key;
  const whole = tokens.join("");
  const first = tokens[0];
  if (k.length <= 2) {
    if (first === k) return true;
    return first.startsWith(k) && BRANCH.test(first.slice(k.length)) && first.length > k.length + 1;
  }
  if (first === k) return true;
  // 첫 낱말이 아닌 자리의 같은 낱말은 바로 앞이나 뒤 낱말이 지점 표기일 때만("성수역점 써브웨이", "(주)은하 BBQ 홍대입구점").
  // "텍사스 BBQ", "더 커피빈 하우스" 같은 일반 낱말 쓰임을 막는다.
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === k && (isBranchToken(tokens[i - 1]) || isBranchToken(tokens[i + 1]))) return true;
  }
  if (whole.startsWith(k)) {
    const rest = whole.slice(k.length);
    // 3자 별칭은 뒤가 비었거나, 지점 표기이거나, 숫자로 이어질 때만("커피빈집" 같은 독립 상호를 막는다)
    if (k.length >= 4 || rest === "" || BRANCH.test(rest) || /^[0-9]/.test(rest)) return true;
  }
  if (k.length >= 4) {
    const i = whole.indexOf(k);
    if (i > 0) {
      const rest = whole.slice(i + k.length);
      if (rest === "" || BRANCH.test(rest)) return true;
    }
  }
  return false;
}

/** 맞은 브랜드와 별칭(brands.ts에 적힌 그대로). 없으면 null */
export function matchBrand(name: string): { brand: string; alias: string } | null {
  if (typeof name !== "string" || name.length === 0) return null;
  const frags = fragments(name);
  for (const a of ALIASES) {
    for (const tokens of frags) {
      if (matchTokens(tokens, a)) return { brand: a.brand, alias: a.alias };
    }
  }
  return null;
}

export function isFranchise(name: string, category?: string): boolean {
  if (category === "푸드코트") return true;
  return matchBrand(name) !== null;
}
