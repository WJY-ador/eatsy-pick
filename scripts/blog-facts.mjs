// 블로그 글감 뽑기. /analysis 화면을 Ego Browser로 읽어 facts.json과 스크린샷을 낸다.
// 문장은 쓰지 않는다. 글은 Claude 세션에서 scripts/blog-guide.md를 따라 쓰고 scripts/blog-check.mjs로 검사한다.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

const exec = promisify(execFile);
const productionUrl = "https://eatsy-pick.vercel.app";
const spaceName = "Eatsy Pick blog facts automation";
const resultPrefix = "EATSY_BLOG_RESULT ";

// readAnalysis와 validateAnalysis는 toString()으로 Ego 코드에 넣는다. 함수 밖의 이름을 참조하지 않는다.
export function validateAnalysis(data, url, { pathOnly = false } = {}) {
  const number = (text, pattern = /^([0-9,]+)$/) => {
    const match = text?.match(pattern);
    const value = match && Number(match[1].replaceAll(",", ""));
    return Number.isSafeInteger(value) ? value : null;
  };
  const samePage = (a, b) => {
    if (!pathOnly) return a === b;
    try {
      const [x, y] = [new URL(a), new URL(b)];
      return x.pathname + x.search === y.pathname + y.search;
    } catch {
      return false;
    }
  };
  // "60대이상남성" → "60대 이상 남성"
  const customerName = (raw) => raw.replace(/(이상|이하)/, " $1").replace(/(남성|여성)$/, " $1").replace(/\s+/g, " ").trim();
  if (data.error) throw new Error(data.error);
  if (data.url !== url || !samePage(data.canonical, url)) {
    throw new Error("정규 상권 URL이 아닙니다. 상권 slug를 확인해 주세요.");
  }
  if (data.partial) throw new Error("일부 지역 조회에 실패했습니다.");

  const filtered = number(data.filtered, /^([0-9,]+)곳$/);
  if (filtered === 0) throw new Error("조회된 매장이 0곳입니다.");
  const count = number(data.count, /^([0-9,]+)곳$/);
  const countContext = data.countContext?.match(/^프랜차이즈 (제외|포함), 필터 적용$/)?.[1];
  if (!data.title || !data.scope || !countContext || !count || count !== filtered ||
      (data.summary && number(data.summary.total) !== count)) {
    throw new Error("상권 범위 또는 분석 매장 수가 화면 지표와 일치하지 않습니다.");
  }

  // 요약 줄의 1위 고객층: rk01 원문 최빈값(동률은 |), 그 매장 수, rk01이 확인된 매장 수
  const summary = data.summary;
  const leaders = summary?.cust ? summary.cust.split("|") : [];
  let top = null;
  if (leaders.length) {
    const stores = number(summary.custNum);
    const sample = number(summary.custDen);
    const names = summary.names?.at(-1);
    const namesShown = leaders.length > 3
      ? names?.endsWith(` 외 ${leaders.length - 3}개 고객층`)
      : names?.split(", ").length === leaders.length;
    if (!stores || !sample || stores > sample || sample > count || !namesShown) {
      throw new Error("요약 줄의 1위 고객층 값이 일치하지 않습니다.");
    }
    top = { names, labels: leaders.map(customerName), leaders: leaders.length, stores, sample };
  } else if (summary?.custNum || summary?.custDen) {
    throw new Error("요약 줄의 1위 고객층 값이 일치하지 않습니다.");
  }

  // 손님 피라미드: 연령대 5단 x 성별 10칸. 칸 합 + 연령대를 읽지 못한 수 = rk01이 확인된 매장 수
  let pyramid = null;
  if (data.pyramid) {
    const den = number(data.pyramid.den);
    const max = number(data.pyramid.max);
    const unread = number(data.pyramid.unread);
    const ages = ["20대이하", "30대", "40대", "50대", "60대이상"];
    const cells = data.pyramid.cells.map((cell) => {
      const stores = number(cell.count);
      const label = cell.label?.match(/^(.+)이 1위인 가게 ([0-9,]+)곳$/);
      // 0곳 칸은 버튼이 없어 이름을 data-age, data-gender로 만든다
      const name = `${cell.age?.replace(/(이상|이하)$/, " $1")} ${cell.gender}`;
      if (stores === null || cell.pressed !== "false" ||
          !ages.includes(cell.age) || !["남성", "여성"].includes(cell.gender) ||
          (stores > 0 && (!label || label[1] !== name || number(label[2]) !== stores || number(cell.visibleCount) !== stores)) ||
          (stores === 0 && cell.label !== null)) {
        throw new Error("손님 피라미드 칸의 매장 수가 일치하지 않습니다.");
      }
      return { key: `${cell.age}${cell.gender}`, label: name, stores };
    });
    const sum = cells.reduce((total, cell) => total + cell.stores, 0);
    if (cells.length !== 10 || new Set(cells.map((cell) => cell.key)).size !== 10 ||
        !den || unread === null || max !== Math.max(...cells.map((cell) => cell.stores)) ||
        sum + unread !== den || den !== top?.sample) {
      throw new Error("손님 피라미드 칸 합이 1위 고객층 확인 매장 수와 일치하지 않습니다.");
    }
    // 요약 줄 최빈값은 원문 기준이라 칸(10대와 20대를 합친 칸 등)의 매장 수보다 클 수 없다
    for (const raw of leaders) {
      const match = /^(\d+)대(이상|이하)?(남성|여성)$/.exec(raw.replace(/\s+/g, ""));
      const age = match && Number(match[1]);
      const band = !match ? null : age <= 20 ? "20대이하" : age >= 60 ? "60대이상" :
        [30, 40, 50].includes(age) ? `${age}대` : null;
      const limit = band ? cells.find((cell) => cell.key === band + match[3]).stores : unread;
      if (top.stores > limit) throw new Error("요약 줄의 1위 고객층과 손님 피라미드 칸이 일치하지 않습니다.");
    }
    pyramid = { den, unread, cells, help: data.pyramid.help || null };
  } else if (top || data.pyramidEmpty !== "1위 고객층 정보가 있는 매장이 없습니다.") {
    throw new Error("손님 피라미드를 확인할 수 없습니다.");
  }

  // 여기부터는 글감이다. 화면 안의 값끼리 맞지 않으면 그 항목만 빼고 이유를 남긴다.
  const skipped = [];
  const optional = (key, read) => {
    try {
      return read();
    } catch (error) {
      skipped.push({ key, reason: error.message });
      return null;
    }
  };

  const franchiseStores = optional("stores.franchiseStores", () => {
    const value = number(data.franchise?.text?.replace(/\s+/g, ""), /^프랜차이즈제외\(([0-9,]+)곳\)$/);
    if (value === null || data.franchise.checked !== String(countContext === "제외")) {
      throw new Error("프랜차이즈 스위치의 매장 수를 읽지 못했습니다.");
    }
    return value;
  });

  const peak = optional("summary.peak", () => {
    if (!summary?.peak) throw new Error("요약 줄에 대표 피크가 없습니다.");
    const days = { 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일", 일: "일요일" };
    const keys = summary.peak.split("|");
    const labels = keys.map((key) => {
      const match = /^(월|화|수|목|금|토|일)-(새벽|오전|점심|오후|저녁|심야)$/.exec(key);
      if (!match) throw new Error(`대표 피크 값을 읽지 못했습니다. ${key}`);
      return `${days[match[1]]} ${match[2]}`;
    });
    const stores = number(summary.peakNum);
    const sample = number(summary.peakDen);
    const shown = summary.names?.[0];
    const namesShown = keys.length > 3
      ? shown === `${labels.slice(0, 3).join(", ")} 외 ${keys.length - 3}개 조합`
      : shown === labels.join(", ");
    if (!stores || !sample || stores > sample || sample > count || !namesShown) {
      throw new Error("요약 줄의 대표 피크 값이 일치하지 않습니다.");
    }
    return { labels, stores, sample };
  });

  const visit = {};
  for (const [flag, name] of [["local", "동네맛집"], ["hoesik", "회식 적합"]]) {
    visit[flag] = optional(`visit.${flag}`, () => {
      const gauge = data.gauges?.find((item) => item.flag === flag);
      const stores = number(gauge?.num);
      const sample = number(gauge?.den);
      if (!gauge || gauge.name !== `${name} 뜻` || gauge.pressed !== "false" || !gauge.help ||
          stores === null || sample === null || stores > sample || sample > count) {
        throw new Error(`${name} 게이지를 읽지 못했습니다.`);
      }
      if (sample === 0) throw new Error(`${name} 값이 확인된 매장이 없습니다.`);
      const percent = Math.round((stores / sample) * 100);
      if (gauge.text !== `${stores}곳, ${percent}%`) throw new Error(`${name} 게이지 글과 값이 일치하지 않습니다.`);
      return { name, stores, sample, percent, help: gauge.help };
    });
  }

  // 업종 트리맵: 블록과 묶음 목록의 매장 수 합 = 트리맵 합 = 분석 매장 수
  const categories = optional("categories", () => {
    const items = (data.categories ?? []).map((item) => ({ name: item.name, stores: number(item.count), rest: item.rest }));
    const sum = items.reduce((total, item) => total + (item.stores ?? 0), 0);
    const rest = items.filter((item) => item.rest);
    if (!items.length || items.some((item) => !item.name || !item.stores) ||
        new Set(items.map((item) => item.name)).size !== items.length ||
        sum !== count || number(data.categoryTotal) !== sum ||
        (data.categoryMore !== null && number(data.categoryMore) !== rest.reduce((total, item) => total + item.stores, 0))) {
      throw new Error("업종별 매장 수 합이 분석 매장 수와 일치하지 않습니다.");
    }
    return items.map(({ name, stores }) => ({ name, stores }))
      .sort((a, b) => b.stores - a.stores || a.name.localeCompare(b.name, "ko"));
  });

  return {
    title: data.title, scope: data.scope, count, countContext, top, pyramid,
    summaryText: summary?.text ?? null, franchiseStores, peak, visit, categories, skipped,
  };
}

export function readAnalysis() {
  const shown = (selector) => document.querySelector(selector)?.checkVisibility() ?? false;
  const text = (element) => element?.innerText.trim() ?? "";
  const kpis = document.querySelector("[data-testid=kpis]");
  const count = kpis?.querySelector("[data-testid=kpi-count]");
  const summary = document.querySelector("[data-testid=summary-line]");
  const chart = document.querySelector("[aria-labelledby=cust-title]");
  const pyramid = chart?.querySelector("[data-testid=pyramid]");
  const franchise = document.querySelector("[aria-labelledby=analysis-title] [role=switch]");
  // 업종 탭은 모바일에서 숨겨져 있어 innerText 대신 data 값만 읽는다
  const blocks = [...document.querySelectorAll("[data-testid=treemap-block]")];
  const rest = [...document.querySelectorAll("[data-testid=treemap-rest]")];
  const category = (rest) => (element) => ({ name: element.dataset.cat, count: element.dataset.count, rest });

  return {
    url: location.href,
    canonical: document.querySelector("link[rel=canonical]")?.href,
    title: text(document.querySelector("#analysis-title")),
    scope: text(document.querySelector("[data-testid=scope]")),
    filtered: text(document.querySelector("[data-testid=filtered]")),
    count: text(count),
    countContext: text(count?.nextElementSibling),
    summary: summary ? {
      ...summary.dataset,
      names: [...summary.querySelectorAll("strong")].map(text),
      text: text(summary),
    } : null,
    partial: shown("[data-testid=partial]"),
    error: text(document.querySelector("main section[role=alert] h1")),
    franchise: franchise ? { text: text(franchise), checked: franchise.getAttribute("aria-checked") } : null,
    gauges: [...document.querySelectorAll("[data-testid=gauge]")].map((gauge) => {
      const button = gauge.querySelector("[data-testid=kpi-filter]");
      return {
        flag: gauge.dataset.flag,
        name: gauge.querySelector("[data-testid=help-btn]")?.getAttribute("aria-label") ?? null,
        num: button?.dataset.num,
        den: button?.dataset.den,
        text: text(button),
        pressed: button?.getAttribute("aria-pressed") ?? null,
        help: gauge.querySelector("[data-testid=help-text]")?.textContent.trim() ?? "",
      };
    }),
    categories: [...blocks.map(category(false)), ...rest.map(category(true))],
    categoryTotal: document.querySelector("[data-testid=treemap]")?.dataset.total ?? null,
    categoryMore: document.querySelector("[data-testid=treemap-more]")?.dataset.count ?? null,
    pyramid: pyramid ? {
      den: pyramid.dataset.den,
      max: pyramid.dataset.max,
      unread: pyramid.dataset.unread,
      help: chart.querySelector("[data-testid=help-text]")?.textContent.trim() ?? "",
      cells: [...pyramid.querySelectorAll("[data-testid=pyramid-cell]")].map((cell) => {
        const button = cell.querySelector(":scope > button");
        return {
          age: cell.dataset.age,
          gender: cell.dataset.gender,
          count: cell.dataset.count,
          pressed: cell.dataset.pressed,
          label: button?.getAttribute("aria-label") ?? null,
          visibleCount: text(button),
        };
      }),
    } : null,
    pyramidEmpty: pyramid ? "" : text(chart?.querySelector(":scope > p")),
  };
}

/** 업종 상위로 담는 수. 나머지는 이름만 담는다 */
const TOP_CATEGORIES = 5;

/**
 * 검증한 화면 값을 글감으로 묶는다. 값마다 meaning에 무엇을 세는지 적는다.
 * 읽지 못한 항목은 빼고 skipped에 이유를 남긴다.
 */
export function buildFacts(analysis, { url, checkedOn }) {
  const { title, scope, count, countContext, top, pyramid, peak, visit, categories, franchiseStores } = analysis;
  const skipped = [...analysis.skipped];
  const area = title.match(/^(.+) 맛집 한눈에$/)?.[1];
  if (!area) skipped.push({ key: "area.name", reason: "화면 제목에서 상권 이름을 읽지 못했습니다." });
  const share = new URL("https://blog.naver.com/openapi/share");
  share.searchParams.set("url", url);

  const facts = {
    schema: 1,
    checkedOn,
    links: {
      original: url,
      naverShare: share.href,
      meaning: "original은 글에 넣는 분석 화면 주소입니다. naverShare는 네이버 블로그 글쓰기를 여는 주소이며 글에 넣지 않습니다. 제목은 blog:check가 통과하면 붙여 줍니다.",
    },
    area: {
      ...(area ? { name: area } : {}),
      title,
      dongs: scope.split(", "),
      meaning: "name은 상권 이름, title은 분석 화면 제목, dongs는 이 상권으로 조회한 동입니다.",
    },
    stores: {
      count,
      franchise: countContext,
      ...(franchiseStores === null ? {} : { franchiseStores }),
      meaning: countContext === "제외"
        ? "count는 프랜차이즈를 뺀 분석 매장 수입니다. franchiseStores는 조회 결과에서 프랜차이즈로 판정돼 count에서 빠진 매장 수입니다."
        : "count는 프랜차이즈를 포함한 분석 매장 수입니다. franchiseStores는 그중 프랜차이즈로 판정된 매장 수입니다.",
    },
  };

  const gauges = Object.fromEntries(Object.entries(visit).filter(([, value]) => value).map(([flag, value]) => [flag, {
    name: value.name,
    stores: value.stores,
    sample: value.sample,
    percent: value.percent,
    meaning: `${value.help} stores는 그런 매장 수, sample은 이 값이 확인된 매장 수, percent는 stores를 sample로 나눠 반올림한 값입니다. sample은 화면에 숫자로 보이지 않습니다.`,
  }]));
  if (Object.keys(gauges).length) facts.visit = gauges;

  if (peak || top) {
    facts.summary = {
      // 화면 문장은 요약 줄 값을 하나라도 뺐으면 담지 않는다(뺀 값이 문장에 남는다)
      ...(analysis.summaryText && !skipped.some(({ key }) => key.startsWith("summary.")) ? { text: analysis.summaryText } : {}),
      ...(peak ? { peak: {
        names: peak.labels,
        stores: peak.stores,
        sample: peak.sample,
        meaning: "stores는 대표 피크가 그 요일과 시간대인 매장 수입니다. 대표 피크는 결제 데이터로 본 매장별 가장 붐비는 요일과 시간대이며, 지금의 혼잡이나 대기 시간이 아닙니다. sample은 대표 피크가 확인된 매장 수로, 화면에 숫자로 보이지 않습니다. 이름이 여럿이면 동률이고 각각 stores곳입니다.",
      } } : {}),
      ...(top ? { topCustomer: {
        names: top.labels,
        stores: top.stores,
        sample: top.sample,
        meaning: "stores는 그 고객층이 1위 고객층인 매장 수입니다. 손님 수나 비율이 아닙니다. sample은 1위 고객층이 확인된 매장 수로, 화면에 숫자로 보이지 않습니다. 이름이 여럿이면 동률이고 각각 stores곳입니다.",
      } } : {}),
    };
  }

  if (pyramid) {
    facts.pyramid = {
      cells: pyramid.cells.map((cell) => ({ name: cell.label, stores: cell.stores })),
      sample: pyramid.den,
      unread: pyramid.unread,
      meaning: `${pyramid.help || "칸의 수는 그 연령대와 성별이 1위 고객층인 매장 수입니다. 손님 수나 비율이 아닙니다."} 10대는 20대 이하 칸에 들어가므로 summary.topCustomer와 이름, 수가 다를 수 있습니다. sample은 1위 고객층이 확인된 매장 수, unread는 연령대를 읽지 못해 칸에서 빠진 매장 수입니다.`,
    };
  }

  if (categories) {
    facts.categories = {
      top: categories.slice(0, TOP_CATEGORIES),
      kinds: categories.length,
      others: categories.slice(TOP_CATEGORIES).map((item) => item.name),
      meaning: `업종 이름은 매장 원본 업종입니다. stores는 그 업종의 매장 수이고 모든 업종의 stores를 더하면 stores.count입니다. top은 매장 수가 많은 ${TOP_CATEGORIES}개 업종(같은 수는 이름 순), kinds는 업종 가짓수, others는 나머지 업종 이름입니다.`,
    };
  }

  facts.screenshots = {
    "overview.png": "상권 제목, 조회 지역, 요약 줄, 분석 매장 수, 방문 성격 게이지",
    "customers.png": "손님 피라미드",
  };
  facts.skipped = skipped;
  return facts;
}

async function runEgo(code) {
  try {
    const { stdout, stderr } = await exec("ego-browser", ["nodejs", "-e", code]);
    return `${stdout}\n${stderr}`;
  } catch (error) {
    const detail = error.stderr?.trim().split("\n").find((line) => /Error:/.test(line)) || error.message;
    throw new Error(error.code === "ENOENT" ? "ego-browser 명령을 찾을 수 없습니다." : detail);
  }
}

async function captureAnalysis(url, stage, pathOnly) {
  const logs = await runEgo(`
    if ((await listTaskSpaces()).some((space) => space.name === ${JSON.stringify(spaceName)})) {
      throw new Error("블로그 글감 자동화 작업 공간을 사용 중입니다.");
    }
    const task = await taskSpace(${JSON.stringify(spaceName)});
    const page = task.page("p1");
    const url = ${JSON.stringify(url)};
    let result;
    try {
      await page.goto(url, { timeout: 30_000 });
      await page.waitForSelector("#analysis-title, main section[role=alert] h1", { state: "visible", timeout: 35_000 });
      const showTab = await page.evaluate(() => {
        const kpis = document.querySelector("[data-testid=kpis]");
        const chart = document.querySelector("[aria-labelledby=cust-title]");
        return kpis && chart && !chart.checkVisibility();
      });
      if (showTab) {
        await page.click('[data-tab=cust]', { label: "손님 피라미드 보기" });
        await page.waitForSelector('#chart-cust[data-active=true]', { state: "visible" });
      }
      const data = await page.evaluate(${readAnalysis.toString()});
      const validate = ${validateAnalysis.toString()};
      result = { analysis: validate(data, url, { pathOnly: ${JSON.stringify(pathOnly)} }) };
      const clips = await page.evaluate(async () => {
        await document.fonts.ready;
        const clip = (...nodes) => {
          const rects = nodes.map((node) => node.getBoundingClientRect());
          const left = Math.min(...rects.map((r) => r.left));
          const top = Math.min(...rects.map((r) => r.top));
          const right = Math.max(...rects.map((r) => r.right));
          const bottom = Math.max(...rects.map((r) => r.bottom));
          return { x: Math.round(left + scrollX), y: Math.round(top + scrollY),
            width: Math.round(right - left), height: Math.round(bottom - top) };
        };
        return {
          overview: clip(document.querySelector('[aria-labelledby=analysis-title]'),
            document.querySelector('[data-testid=kpis]').closest('section')),
          customers: clip(document.querySelector('[aria-labelledby=cust-title]')),
        };
      });
      await page.screenshot({ path: ${JSON.stringify(join(stage, "overview.png"))}, fullPage: true, clip: clips.overview });
      await page.screenshot({ path: ${JSON.stringify(join(stage, "customers.png"))}, fullPage: true, clip: clips.customers });
    } catch (error) {
      result = { error: error.message };
    }
    console.log(${JSON.stringify(resultPrefix)} + JSON.stringify({ spaceId: task.spaceId, ...result }));
  `);
  const line = logs.split("\n").find((item) => item.includes(resultPrefix));
  if (!line) throw new Error("Ego Browser에서 분석 결과를 받지 못했습니다.");
  const result = JSON.parse(line.slice(line.indexOf(resultPrefix) + resultPrefix.length));
  await runEgo(`
    const task = await taskSpace(${JSON.stringify(result.spaceId)});
    await task.finish({ keep: [] });
  `);
  if (result.error) throw new Error(result.error);
  return result.analysis;
}

async function main() {
  const { positionals: [slug], positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "out-dir": { type: "string" }, base: { type: "string" } },
  });
  const usage = "사용법 npm run blog:facts -- <상권-slug> [--out-dir <폴더>] [--base <확인용 주소>]";
  if (positionals.length !== 1 || !/^[a-z][a-z0-9-]{0,39}$/.test(slug)) throw new Error(usage);
  // --base는 배포 전 로컬 확인용이다. 화면만 그 주소에서 읽고, facts의 링크와 공유 주소는 운영 주소를 쓴다.
  // 로컬 canonical은 사이트 주소 설정을 따르므로 이때는 경로와 쿼리만 비교한다.
  const base = values.base === undefined ? productionUrl : URL.parse(values.base)?.origin;
  if (!base || !/^https?:/.test(base)) throw new Error(usage);
  const path = `/analysis?area=${slug}`;
  const url = new URL(path, productionUrl).href;
  const target = new URL(path, base).href;
  const output = values["out-dir"] ? resolve(values["out-dir"]) : join(tmpdir(), "eatsy-pick-blog", slug);
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, ".blog-facts-"));
  const files = ["overview.png", "customers.png", "facts.json"];
  try {
    const analysis = await captureAnalysis(target, stage, base !== productionUrl);
    const checkedOn = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    const facts = buildFacts(analysis, { url, checkedOn });
    await writeFile(join(stage, "facts.json"), `${JSON.stringify(facts, null, 2)}\n`, "utf8");
    for (const file of files) await rename(join(stage, file), join(output, file));
    for (const file of files) console.log(join(output, file));
    for (const { key, reason } of facts.skipped) console.error(`뺀 항목 ${key}: ${reason}`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`블로그 글감을 뽑지 못했습니다. ${error.message}`);
    process.exitCode = 1;
  });
}
