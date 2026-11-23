import Link from "next/link";
import { radiusLabel, withSubject } from "@/lib/format";
import { occasionBySlug } from "@/lib/occasions";
import { type DecideInput, hrefFor, placeName, resultsTitle, toSearch } from "@/lib/query";
import { NavLink } from "./ControlBar";
import { getDecision } from "./decision";
import { ResultCard } from "./ResultCard";
import { ShareActions } from "./ShareActions";

/** 결과 머리줄: 제목과 프랜차이즈 제외 토글. 조건이 바뀌는 동안에도 남는다(Suspense 밖). */
export function ResultsHead({ input }: { input: DecideInput }) {
  const toggled = hrefFor({ area: input.area?.slug, q: input.q, occ: input.occ, excludeFranchise: !input.excludeFranchise });
  return (
    <div className="results__head container">
      <h1 id="res-h" className="results__h">
        {resultsTitle(input)}
      </h1>
      <NavLink href={toggled} className="switch" role="switch" aria-checked={input.excludeFranchise} aria-label="프랜차이즈 제외">
        <span className="switch__track" aria-hidden="true" />
        <span className="switch__text">프랜차이즈 제외</span>
      </NavLink>
    </div>
  );
}

/** 결과 본문: 오류, 빈 결과, 결과 */
export async function ResultsBody({ input }: { input: DecideInput }) {
  const occ = occasionBySlug(input.occ)!;
  const d = await getDecision(input);
  const place = placeName(input);
  const self = `/${toSearch(input)}`;

  if (d.status === "error") {
    return (
      <div className="results container">
        <div className="state state--error" role="alert">
          <h2 className="state__h">결제 데이터를 불러오지 못했습니다.</h2>
          <p>
            {d.rateLimited
              ? `조회가 한꺼번에 몰려 잇플 조회 ${d.calls.planned}건이 모두 막혔습니다. 1분쯤 지나 다시 시도해 주세요.`
              : `잇플 조회 ${d.calls.planned}건이 모두 실패했습니다. 잠시 뒤 다시 시도해 주세요.`}
          </p>
          <a className="btn btn--primary" href={self}>
            다시 시도
          </a>
        </div>
      </div>
    );
  }

  if (d.status === "empty") {
    const morePage = input.n > 1;
    return (
      <div className="results container">
        <div className="state state--empty">
          <h2 className="state__h">
            {morePage ? "더 보여 줄 곳이 없습니다." : `${place}에서 ${occ.name} 자리를 찾지 못했습니다.`}
          </h2>
          {morePage ? (
            <>
              <p>
                {place} {occ.name} 후보 {d.candidates}곳을 모두 보여 드렸습니다.
              </p>
              <NavLink href={`/${toSearch(input, { n: 1 })}`} className="btn btn--primary">
                처음 3곳 다시 보기
              </NavLink>
            </>
          ) : input.area ? (
            <p>{occ.name}에 맞는 업종의 결제 데이터가 이 상권에 없습니다. 위에서 다른 모임을 골라 보세요.</p>
          ) : (
            <p>
              주소에 {withSubject(place)} 들어간 가게가 없습니다. 위 다른 동네 칸에 동 이름(예: 문래동)이나 도로명(예:
              도산대로)을 넣어 보세요.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="results container">
      <p className="results__meta">
        {input.area ? `${input.area.centerName} ${radiusLabel(d.radius)}, ` : ""}시군구 매출 순위로 골랐습니다.
        {d.calls.failed > 0 ? ` 조회 ${d.calls.planned}건 중 ${d.calls.failed}건이 실패해 나머지로 골랐습니다.` : ""}
      </p>
      <div className="picks">
        {d.picks.map((c) => (
          <ResultCard key={`${c.rank}-${c.item.merNm}`} choice={c} area={input.area} />
        ))}
      </div>
      <div className="results__next">
        {d.hasMore ? (
          <NavLink href={`/${toSearch(input, { n: input.n + 1 })}`} className="link">
            다른 3곳 보기
          </NavLink>
        ) : null}
        {input.area ? (
          <Link className="link" prefetch={false} href={`/area/${input.area.slug}`}>
            {input.area.name} 결제 랭킹 보기
          </Link>
        ) : (
          <Link className="link" prefetch={false} href="/area">
            상권별 결제 랭킹 보기
          </Link>
        )}
      </div>
      <div className="share">
        <ShareActions path={self} />
      </div>
    </div>
  );
}

/** 로딩: 카드 모양의 스켈레톤. 평소엔 숨어 있다가 조건을 바꾼 뒤 서버 응답을 기다리는 동안 결과 자리에 선다(CSS). */
export function ResultsSkeleton() {
  return (
    <div className="results results--skel container" aria-hidden="true">
      <p className="results__meta">결제 데이터를 모으는 중입니다.</p>
      <div className="picks">
        {[1, 2, 3].map((i) => (
          <div className="pick pick--skel" key={i}>
            <span className="skel skel--name" />
            <span className="skel skel--tags" />
            <span className="skel skel--line" />
            <span className="skel skel--go" />
          </div>
        ))}
      </div>
    </div>
  );
}
