import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

const exec = promisify(execFile);
const productionUrl = "https://eatsy-pick.vercel.app";
const spaceName = "Eatsy Pick blog draft automation";
const resultPrefix = "EATSY_BLOG_RESULT ";

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
    top = { names, leaders: leaders.length, stores, sample };
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
      if (stores === null || cell.pressed !== "false" ||
          !ages.includes(cell.age) || !["남성", "여성"].includes(cell.gender) ||
          (stores > 0 && (!label || number(label[2]) !== stores || number(cell.visibleCount) !== stores)) ||
          (stores === 0 && cell.label !== null)) {
        throw new Error("손님 피라미드 칸의 매장 수가 일치하지 않습니다.");
      }
      return { key: `${cell.age}${cell.gender}`, label: label?.[1] ?? null, stores };
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
    pyramid = { den, unread, cells };
  } else if (top || data.pyramidEmpty !== "1위 고객층 정보가 있는 매장이 없습니다.") {
    throw new Error("손님 피라미드를 확인할 수 없습니다.");
  }
  return { title: data.title, scope: data.scope, count, countContext, top, pyramid };
}

export function readAnalysis() {
  const shown = (selector) => document.querySelector(selector)?.checkVisibility() ?? false;
  const text = (element) => element?.innerText.trim() ?? "";
  const kpis = document.querySelector("[data-testid=kpis]");
  const count = kpis?.querySelector("[data-testid=kpi-count]");
  const summary = document.querySelector("[data-testid=summary-line]");
  const chart = document.querySelector("[aria-labelledby=cust-title]");
  const pyramid = chart?.querySelector("[data-testid=pyramid]");

  return {
    url: location.href,
    canonical: document.querySelector("link[rel=canonical]")?.href,
    title: text(document.querySelector("#analysis-title")),
    scope: text(document.querySelector("[data-testid=scope]")),
    filtered: text(document.querySelector("[data-testid=filtered]")),
    count: text(count),
    countContext: text(count?.nextElementSibling),
    summary: summary ? { ...summary.dataset, names: [...summary.querySelectorAll("strong")].map(text) } : null,
    partial: shown("[data-testid=partial]"),
    error: text(document.querySelector("main section[role=alert] h1")),
    pyramid: pyramid ? {
      den: pyramid.dataset.den,
      max: pyramid.dataset.max,
      unread: pyramid.dataset.unread,
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
      throw new Error("블로그 초안 자동화 작업 공간을 사용 중입니다.");
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

function pyramidLines({ cells, unread }, top) {
  const ranked = cells.filter((cell) => cell.stores > 0).sort((a, b) => b.stores - a.stores);
  const caption = "![1위 고객층 기준 연령, 성별 피라미드](customers.png)";
  const unreadText = unread ? ` 연령대를 읽지 못한 1위 고객층 ${unread}곳은 칸에서 빠집니다.` : "";
  if (!ranked.length) return [`손님 피라미드는 1위 고객층을 연령대와 성별 칸으로 나눠 매장 수를 셉니다.${unreadText}`, caption];
  const first = ranked.filter((cell) => cell.stores === ranked[0].stores);
  const names = (list) => list.map((cell) => cell.label).join(", ");
  let line;
  if (first.length > 4) {
    line = `칸별로는 ${first.length}개 칸이 각각 ${first[0].stores}곳으로 가장 많습니다.`;
  } else if (first.length > 1) {
    line = `칸별로는 ${names(first)}이 각각 ${first[0].stores}곳으로 가장 많습니다.`;
  } else {
    const next = ranked.filter((cell) => cell !== first[0] && cell.stores === ranked[1]?.stores);
    // 가장 많은 칸이 요약 줄의 1위 고객층과 같은 값이면 앞 문장과 겹치므로 다음 칸만 쓴다
    const repeated = top?.leaders === 1 && first[0].label === top.names && first[0].stores === top.stores;
    const fit = next.length && next.length <= 2;
    const nextText = fit ? `${names(next)}이 ${next.length > 1 ? "각각 " : ""}${next[0].stores}곳` : "";
    line = repeated && fit
      ? `칸별로는 ${first[0].label} 다음으로 ${nextText}입니다.`
      : `칸별로는 ${first[0].label}이 ${first[0].stores}곳으로 가장 많${fit ? `고, ${nextText}으로 뒤를 잇습니다.` : "습니다."}`;
  }
  return [
    `손님 피라미드는 1위 고객층을 연령대와 성별 칸으로 나눠 매장 수를 셉니다. ${line} 칸의 수는 그 연령대와 성별이 1위 고객층인 매장 수이며, 손님 수나 비율이 아닙니다.${unreadText}`,
    caption,
  ];
}

export function draftMarkdown(data, url) {
  const { title, scope, count, countContext, top, pyramid } = data;
  const postTitle = `${title}, BC카드 결제 데이터로 본 매장 ${count}곳`;
  const share = new URL("https://blog.naver.com/openapi/share");
  share.search = new URLSearchParams({ url, title: postTitle }).toString();
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  return [
    `# ${postTitle}`,
    `Eatsy Pick에서 ${scope}의 가게를 살펴봤습니다. 프랜차이즈를 ${countContext}한 화면에서 분석 매장은 ${count}곳입니다.`,
    "![상권 분석 화면과 핵심 지표](overview.png)",
    ...(top ? [
      `1위로 가장 많이 나온 고객층은 ${top.names}입니다. 1위 고객층이 확인된 ${top.sample}곳 가운데 ${top.leaders > 1 ? "각각 " : ""}${top.stores}곳에서 1위였습니다.`,
    ] : []),
    ...(pyramid ? pyramidLines(pyramid, top) : []),
    "분석 화면에서 대표 피크, 손님 피라미드, 업종별 매장 수를 함께 볼 수 있습니다. 차트 항목을 누르면 해당 매장을 지도와 목록에서 볼 수 있습니다.",
    `[${title}](${url})`,
    `자료는 eat.pl 잇플, BC카드 결제 데이터를 사용합니다. 화면 확인일은 ${date}입니다.`,
    "---",
    `[검토 후 네이버 블로그 글쓰기 열기](${share})`,
  ].join("\n\n") + "\n";
}

async function main() {
  const { positionals: [slug], positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "out-dir": { type: "string" }, base: { type: "string" } },
  });
  const usage = "사용법 npm run blog:draft -- <상권-slug> [--out-dir <폴더>] [--base <확인용 주소>]";
  if (positionals.length !== 1 || !/^[a-z][a-z0-9-]{0,39}$/.test(slug)) throw new Error(usage);
  // --base는 배포 전 로컬 확인용이다. 화면만 그 주소에서 읽고, 초안의 링크와 공유 주소는 운영 주소를 쓴다.
  // 로컬 canonical은 사이트 주소 설정을 따르므로 이때는 경로와 쿼리만 비교한다.
  const base = values.base === undefined ? productionUrl : URL.parse(values.base)?.origin;
  if (!base || !/^https?:/.test(base)) throw new Error(usage);
  const path = `/analysis?area=${slug}`;
  const url = new URL(path, productionUrl).href;
  const target = new URL(path, base).href;
  const output = values["out-dir"] ? resolve(values["out-dir"]) : join(tmpdir(), "eatsy-pick-blog", slug);
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, ".blog-draft-"));
  const files = ["overview.png", "customers.png", "draft.md"];
  try {
    const analysis = await captureAnalysis(target, stage, base !== productionUrl);
    await writeFile(join(stage, "draft.md"), draftMarkdown(analysis, url), "utf8");
    for (const file of files) await rename(join(stage, file), join(output, file));
    for (const file of files) console.log(join(output, file));
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`블로그 초안을 생성하지 못했습니다. ${error.message}`);
    process.exitCode = 1;
  });
}
