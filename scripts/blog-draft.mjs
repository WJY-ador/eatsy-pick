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

export function validateAnalysis(data, url) {
  const number = (text, pattern = /^([0-9,]+)$/) => {
    const match = text?.match(pattern);
    const value = match && Number(match[1].replaceAll(",", ""));
    return Number.isSafeInteger(value) ? value : null;
  };
  if (data.error) throw new Error(data.error);
  if (data.url !== url || data.canonical !== url) {
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

  let top = null;
  if (data.topLabel === "정보 없음" && data.topDetail === "고객층이 확인된 매장 0곳") {
    if (data.summary?.custNum || data.summary?.custDen) {
      throw new Error("1위 고객층 지표와 화면 요약이 일치하지 않습니다.");
    }
  } else {
    const match = data.topDetail?.match(/^1위인 매장 ([0-9,]+)곳 \/ 고객층 확인 ([0-9,]+)곳$/);
    const stores = number(match?.[1]);
    const sample = number(match?.[2]);
    if (!data.topLabel || !stores || stores > sample || sample > count ||
        stores !== number(data.summary?.custNum) || sample !== number(data.summary?.custDen)) {
      throw new Error("1위 고객층 지표와 화면 요약이 일치하지 않습니다.");
    }
    top = { labels: data.topLabel.split(", "), stores, sample };
  }

  const sample = number(data.customerSample, /^([0-9,]+)곳$/);
  const bars = data.customerBars.map((bar) => {
    const label = bar.label?.match(/^(.+?) ([0-9,]+)곳$/);
    const stores = number(bar.count);
    if (!label || !stores || stores > sample ||
        stores !== number(label[2]) || stores !== number(bar.visibleCount)) {
      throw new Error("고객층 1~3위 차트의 매장 수가 일치하지 않습니다.");
    }
    return { label: label[1], stores };
  });
  if (sample === null || sample > count || sample < (top?.sample ?? 0) ||
      (!bars.length !== !sample)) {
    throw new Error("고객층 1~3위 차트의 유효 표본을 확인할 수 없습니다.");
  }
  return { title: data.title, scope: data.scope, count, countContext, top, sample, bars };
}

function readAnalysis() {
  const shown = (selector) => document.querySelector(selector)?.checkVisibility() ?? false;
  const text = (element) => element?.innerText.trim() ?? "";
  const kpis = document.querySelector("[data-testid=kpis]");
  const top = [...(kpis?.querySelectorAll("dt") ?? [])]
    .find((element) => text(element) === "가장 많은 1위 고객층");
  const [topLabel, topDetail] = text(top?.nextElementSibling).split("\n");
  const count = kpis?.querySelector("[data-testid=kpi-count]");
  const chart = document.querySelector("[aria-labelledby=cust-title]");
  const sample = [...(chart?.querySelectorAll("p") ?? [])]
    .map(text)
    .find((value) => value.includes("유효 표본"));
  const summary = document.querySelector("[data-testid=summary-line]");

  return {
    url: location.href,
    canonical: document.querySelector("link[rel=canonical]")?.href,
    title: text(document.querySelector("#analysis-title")),
    scope: text(document.querySelector("[data-testid=scope]")),
    filtered: text(document.querySelector("[data-testid=filtered]")),
    count: text(count),
    countContext: text(count?.nextElementSibling),
    summary: summary ? { ...summary.dataset } : null,
    partial: shown("[data-testid=partial]"),
    error: text(document.querySelector("main section[role=alert] h1")),
    topLabel,
    topDetail,
    customerSample: sample?.match(/유효 표본 ([0-9,]+곳)/)?.[1],
    customerBars: [...(chart?.querySelectorAll("[data-chart=cust] button") ?? [])].map((button) => ({
      label: button.getAttribute("aria-label"),
      count: button.dataset.count,
      visibleCount: text(button.lastElementChild),
    })),
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

async function captureAnalysis(url, stage) {
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
        await page.click('[data-tab=cust]', { label: "주 고객층 차트 보기" });
        await page.waitForSelector('[aria-labelledby=cust-title]', { state: "visible" });
      }
      const data = await page.evaluate(${readAnalysis.toString()});
      const validate = ${validateAnalysis.toString()};
      result = { analysis: validate(data, url) };
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

function draftMarkdown(data, url) {
  const { title, scope, count, countContext, top, sample, bars } = data;
  const postTitle = `${title}, BC카드 결제 데이터로 본 매장 ${count}곳`;
  const share = new URL("https://blog.naver.com/openapi/share");
  share.search = new URLSearchParams({ url, title: postTitle }).toString();
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  return [
    `# ${postTitle}`,
    `Eatsy Pick에서 ${scope}의 가게를 살펴봤습니다. 프랜차이즈를 ${countContext}한 화면에서 분석 매장은 ${count}곳입니다.`,
    "![상권 분석 화면과 핵심 지표](overview.png)",
    ...(top ? [
      `1위로 가장 많이 나온 고객층은 ${top.labels.join(", ")}입니다. 1위 고객층이 확인된 ${top.sample}곳 가운데 ${top.labels.length > 1 ? "각각 " : ""}${top.stores}곳에서 1위였습니다.`,
    ] : []),
    ...(bars.length ? [
      `유효 표본 ${sample}곳에서 고객층 1~3위에 해당 고객층을 포함한 매장 수는 ${bars.slice(0, 2).map(({ label, stores }) => `${label} ${stores}곳`).join(", ")}입니다. 한 매장을 여러 고객층에서 셀 수 있습니다.`,
      "![고객층 1~3위에 포함된 매장 수](customers.png)",
    ] : []),
    "분석 화면에서 주 고객층과 대표 피크를 비교할 수 있습니다. 차트 항목을 누르면 해당 매장을 지도와 목록에서 볼 수 있습니다.",
    `[${title}](${url})`,
    `자료는 eat.pl 잇플, BC카드 결제 데이터를 사용합니다. 화면 확인일은 ${date}입니다.`,
    "---",
    `[검토 후 네이버 블로그 글쓰기 열기](${share})`,
  ].join("\n\n") + "\n";
}

async function main() {
  const { positionals: [slug], positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "out-dir": { type: "string" } },
  });
  if (positionals.length !== 1 || !/^[a-z][a-z0-9-]{0,39}$/.test(slug)) {
    throw new Error("사용법 npm run blog:draft -- <상권-slug> [--out-dir <폴더>]");
  }
  const url = new URL(`/analysis?area=${slug}`, productionUrl).href;
  const output = values["out-dir"] ? resolve(values["out-dir"]) : join(tmpdir(), "eatsy-pick-blog", slug);
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, ".blog-draft-"));
  const files = ["overview.png", "customers.png", "draft.md"];
  try {
    const analysis = await captureAnalysis(url, stage);
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
