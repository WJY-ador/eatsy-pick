// 블로그 초안 사실 검사. 초안 md의 숫자와 이름이 facts.json에 있는지, 의무 표기와 금지어를 본다.
// 하나라도 걸리면 줄 번호와 내용을 찍고 exit 1. 통과하면 초안 제목을 붙인 네이버 블로그 글쓰기 주소를 찍는다.
// 못 보는 것: 숫자가 맞는 이름 옆에 붙었는지, 한글 수사(절반, 세 곳), 문장이 값의 뜻을 바꿨는지. 사람이 읽고 확인한다.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { AREAS } from "../lib/areas.ts";
import { FOOD_CATEGORIES, foodDisplayName } from "../lib/food.ts";

/** 의무 표기 원문(lib/site.ts). 원문 그대로일 때만 가운뎃점 금지에서 뺀다 */
const ATTRIBUTION_ORIGINAL = ["eat.pl 잇플 · BC카드 결제 데이터 기반", "맛·추천 순위가 아닌 카드 결제 데이터 기반 정보입니다."];
const REQUIRED = ["eat.pl 잇플", "BC카드 결제 데이터"];

const BANNED = [
  { pattern: /후보|추정|아마|것 같|듯합|듯한|짐작|예상/g, why: "불확실한 말" },
  { pattern: /직장인|회사원|대학생|학생|주부|커플|연인|(?<!업)데이트|MZ|은퇴/g, why: "연령, 성별로 짐작한 손님 성격" },
  { pattern: /\p{Extended_Pictographic}/gu, why: "이모지" },
  { pattern: /[·・ㆍ‧∙]/g, why: "가운뎃점" },
  { pattern: /[「」『』]/g, why: "낫표" },
];

const DAYS = "월|화|수|목|금|토|일";
const TIMES = "새벽|오전|점심|오후|저녁|심야";
const squash = (text) => text.replace(/\s+/g, "");

/** 찾은 구간을 같은 길이의 공백으로 지워 뒤 단계(숫자 뽑기)에서 다시 잡히지 않게 한다 */
function mask(text, start, length) {
  return text.slice(0, start) + " ".repeat(length) + text.slice(start + length);
}

/** facts에서 단위별 숫자 집합을 모은다. percent는 % 집합, 나머지는 곳, 개 등 매장 수 집합 */
function collectNumbers(facts) {
  const counts = new Set();
  const percents = new Set();
  const walk = (value, key) => {
    if (typeof value === "number") (key === "percent" ? percents : counts).add(value);
    else if (Array.isArray(value)) {
      // 목록의 개수(업종 상위 5개, 피라미드 10칸, 조회한 동 2곳)도 facts에 있는 숫자로 본다
      counts.add(value.length);
      value.forEach((item) => walk(item, key));
    }
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) if (k !== "schema") walk(v, k);
    }
  };
  walk(facts, "");
  return { counts, percents };
}

/** 이름 어휘. allowed는 facts에 있는 것, known은 facts에 없으면 걸리는 것까지 포함한 전체 */
function vocabulary(facts) {
  const slug = new URL(facts.links.original).searchParams.get("area");
  const preset = AREAS.find((area) => area.slug === slug);
  // 같은 상권의 다른 표기(역 이름, 별칭)와 매장 행에 보이는 시군구는 facts 상권과 같은 곳이라 허용한다
  const places = new Set([facts.area.name, ...facts.area.dongs, ...(preset ? [preset.centerName, ...preset.aliases, ...preset.sigungu] : [])]
    .filter(Boolean));
  const knownPlaces = new Set(AREAS.flatMap((area) => [area.name, area.centerName, ...area.aliases, ...area.dongs, ...area.sigungu]));
  places.forEach((place) => knownPlaces.add(place));

  const categoryNames = [...(facts.categories?.top ?? []).map((item) => item.name), ...(facts.categories?.others ?? [])];
  const categories = new Set(categoryNames.flatMap((name) => [name, foodDisplayName(name)]));
  // 한 글자 화면 이름(횟집 → 회)은 회식 같은 낱말에 걸리므로 어휘에서 뺀다
  const knownCategories = new Set([...categories, ...FOOD_CATEGORIES, ...FOOD_CATEGORIES.map(foodDisplayName)].filter((name) => name.length > 1));

  const customers = new Set([...(facts.summary?.topCustomer?.names ?? []), ...(facts.pyramid?.cells ?? []).map((cell) => cell.name)].map(squash));
  const ages = new Set([...customers].map((name) => name.replace(/(남성|여성)$/, "")));
  const peaks = new Set((facts.summary?.peak?.names ?? []).map(squash));
  return { places, knownPlaces, categories, knownCategories, customers, ages, peaks };
}

/**
 * 이름 뒤 숫자 짝. 이름 다음, 쉼표나 마침표나 다른 이름 앞까지 처음 나온 N곳(방문 성격은 같은 문장의 P%도)이 그 이름의 값이어야 한다.
 * 숫자 없이 이어진 이름 묶음("A와 B가 각각 21곳, 15곳")은 묶음 안 어느 이름의 값이면 되고, 두 이름 사이 숫자("A 다음은 15곳인 B")는 뒤 이름의 값이어도 된다.
 * 분석 매장 수와 확인 매장 수(sample)는 어느 이름 뒤에 와도 된다("137곳 가운데 35곳" 꼴).
 */
function pairs(facts) {
  const list = new Map();
  const add = (name, stores, percent) => {
    const entry = list.get(name) ?? { stores: new Set(), percents: new Set() };
    if (stores !== undefined) entry.stores.add(stores);
    if (percent !== undefined) entry.percents.add(percent);
    list.set(name, entry);
  };
  const peak = facts.summary?.peak;
  const top = facts.summary?.topCustomer;
  peak?.names.forEach((name) => add(name, peak.stores));
  top?.names.forEach((name) => add(name, top.stores));
  facts.pyramid?.cells.forEach((cell) => add(cell.name, cell.stores));
  facts.categories?.top.forEach((item) => add(item.name, item.stores));
  facts.categories?.others.forEach((name) => add(name));
  Object.values(facts.visit ?? {}).forEach((item) => add(item.name, item.stores, item.percent));
  const any = new Set([facts.stores.count, peak?.sample, top?.sample, facts.pyramid?.sample].filter((value) => value !== undefined));
  return { list, any };
}

function checkPairs(text, { list, any }, report) {
  const found = [];
  let rest = text;
  for (const name of [...list.keys()].sort((a, b) => b.length - a.length)) {
    let at = rest.indexOf(name);
    while (at >= 0) {
      found.push({ name, start: at, end: at + name.length });
      rest = mask(rest, at, name.length);
      at = rest.indexOf(name, at + name.length);
    }
  }
  found.sort((a, b) => a.start - b.start);
  let group = [];
  found.forEach((item, index) => {
    group.push(item);
    const next = found[index + 1];
    const between = text.slice(item.end, next?.start ?? text.length);
    const sentence = between.split(/[.!?;:]/)[0];
    const reachesNext = next !== undefined && sentence === between;
    if (reachesNext && !/[\d,]/.test(between)) return;
    const entries = group.map(({ name }) => list.get(name));
    const names = group.map(({ name }) => name).join(", ");
    group = [];
    // 방문 성격은 화면처럼 "N곳, P%"로 쓰므로 %는 쉼표를 넘어 같은 문장 안에서 찾는다
    const percent = entries.some((entry) => entry.percents.size) ? sentence.match(/(\d+)\s*%/) : null;
    if (percent && !entries.some((entry) => entry.percents.has(Number(percent[1])))) {
      report(`${names} 뒤 비율 ${percent[0]}: 그 이름의 facts 값과 다름`);
    }
    const clause = entries.length > 1 ? sentence : sentence.split(/,(?!\d{3})/)[0];
    const match = clause.match(/(\d[\d,]*)\s*(곳|%)/);
    if (!match || (match[2] === "%" && percent)) return;
    const value = Number(match[1].replaceAll(",", ""));
    const ok = match[2] === "곳" && (entries.some((entry) => entry.stores.has(value)) || any.has(value) ||
      (reachesNext && !/,(?!\d{3})/.test(between) && list.get(next.name).stores.has(value)));
    if (!ok) report(`${names} 뒤 숫자 ${match[0]}: 그 이름의 facts 값과 다름`);
  });
}

/** 어휘를 긴 것부터 찾아 facts에 없으면 문제로 남기고 지운다 */
function scanNames(text, known, allowed, kind, report) {
  for (const name of [...known].sort((a, b) => b.length - a.length)) {
    let at = text.indexOf(name);
    while (at >= 0) {
      if (!allowed.has(name)) report(`facts에 없는 ${kind} ${name}`);
      text = mask(text, at, name.length);
      at = text.indexOf(name, at + name.length);
    }
  }
  return text;
}

export function checkDraft(markdown, facts) {
  const issues = [];
  const { counts, percents } = collectNumbers(facts);
  const vocab = vocabulary(facts);
  const named = pairs(facts);
  const [year, month, day] = facts.checkedOn.split("-").map(Number);
  let dated = false;

  markdown.split("\n").forEach((raw, index) => {
    const report = (what) => issues.push({ line: index + 1, what, text: raw.trim().slice(0, 80) });

    let plain = raw;
    for (const original of ATTRIBUTION_ORIGINAL) plain = plain.replaceAll(original, "");
    for (const { pattern, why } of BANNED) {
      for (const match of plain.matchAll(pattern)) report(`${why} ${match[0]}`);
    }

    // 1. 주소와 이미지 경로, 줄 머리 목록 번호를 지운다(공유 주소에 %와 숫자가 들어 있다)
    let text = raw.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ").normalize("NFKC")
      .replace(/^(\s*(?:#+\s*)?)\d+[.)]\s/, "$1   ");

    checkPairs(text, named, report);

    // 2. 날짜는 화면 확인일과 같아야 한다
    const datePatterns = [
      /(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?/g,
      /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
      /()(\d{1,2})월\s*(\d{1,2})일/g,
    ];
    for (const pattern of datePatterns) {
      for (const match of text.matchAll(pattern)) {
        const [y, m, d] = match.slice(1).map((value) => (value ? Number(value) : null));
        if ((y !== null && y !== year) || m !== month || d !== day) report(`확인일 ${facts.checkedOn}과 다른 날짜 ${match[0]}`);
        else if (y !== null) dated = true;
        text = mask(text, match.index, match[0].length);
      }
    }

    // 3. 이름: 요일과 시간대, 고객층, 지역, 업종
    for (const match of text.matchAll(new RegExp(`(${DAYS})요일\\s*(${TIMES})`, "g"))) {
      if (!vocab.peaks.has(squash(match[0]))) report(`facts에 없는 대표 피크 ${match[0]}`);
      text = mask(text, match.index, match[0].length);
    }
    for (const match of text.matchAll(/(\d+)대(\s*(?:이상|이하))?(\s*(?:남성|여성|남자|여자))?/g)) {
      const name = squash(match[0]).replace(/남자$/, "남성").replace(/여자$/, "여성");
      const known = match[3] ? vocab.customers.has(name) : vocab.ages.has(name);
      if (!known) report(`facts에 없는 고객층 ${match[0].trim()}`);
      text = mask(text, match.index, match[0].length);
    }
    text = scanNames(text, vocab.knownPlaces, vocab.places, "지역", report);
    text = scanNames(text, vocab.knownCategories, vocab.categories, "업종", report);
    text = text.replaceAll("1위", "   ");

    // 4. 숫자: 쉼표를 빼고 단위별 집합과 맞춘다
    for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)(\s*(?:%|퍼센트|프로|명|곳|개|칸)|위|배)?/g)) {
      const value = Number(match[1].replaceAll(",", ""));
      const unit = match[2]?.trim() ?? "";
      if (["%", "퍼센트", "프로"].includes(unit)) {
        if (!percents.has(value)) report(`facts에 없는 비율 ${match[0].trim()}`);
      } else if (unit === "명") {
        report(`매장 수를 사람 수로 쓴 단위 ${match[0].trim()}`);
      } else if (["위", "배"].includes(unit)) {
        report(`facts에 없는 순위나 배수 ${match[0].trim()}`);
      } else if (!counts.has(value)) {
        report(`facts에 없는 숫자 ${match[0].trim()}`);
      }
    }
  });

  const whole = markdown;
  for (const word of REQUIRED) if (!whole.includes(word)) issues.push({ line: 0, what: `의무 표기 없음 ${word}`, text: "" });
  if (!whole.includes(facts.links.original)) issues.push({ line: 0, what: `원본 링크 없음 ${facts.links.original}`, text: "" });
  if (!dated) issues.push({ line: 0, what: `화면 확인일 없음 ${facts.checkedOn}`, text: "" });
  const title = markdown.match(/^# (.+)$/m)?.[1].trim();
  if (!title) issues.push({ line: 0, what: "제목(# 줄) 없음", text: "" });
  return { issues, title };
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { facts: { type: "string" } } });
  if (positionals.length !== 1) throw new Error("사용법 npm run blog:check -- <초안.md> [--facts <facts.json>]");
  const draftPath = resolve(positionals[0]);
  const factsPath = values.facts ? resolve(values.facts) : join(dirname(draftPath), "facts.json");
  const facts = JSON.parse(await readFile(factsPath, "utf8"));
  const { issues, title } = checkDraft(await readFile(draftPath, "utf8"), facts);
  if (issues.length) {
    for (const { line, what, text } of issues) console.error(line ? `${line}줄: ${what} | ${text}` : `전체: ${what}`);
    console.error(`검사 실패 ${issues.length}건`);
    process.exitCode = 1;
    return;
  }
  const share = new URL(facts.links.naverShare);
  share.searchParams.set("title", title);
  console.log("검사 통과");
  console.log(`네이버 블로그 글쓰기: ${share.href}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`초안을 검사하지 못했습니다. ${error.message}`);
    process.exitCode = 1;
  });
}
