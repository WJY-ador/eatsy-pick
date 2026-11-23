# eatsy-pick

BC카드 잇플(eat.pl) AI 서비스 수익화 챌린지 출품작. 카드 결제 데이터로 모임 장소를 고르는 웹서비스다.

- 서비스: https://eatsy-pick.vercel.app
- 데이터: `eat.pl 잇플 · BC카드 결제 데이터 기반`. 맛·추천 순위가 아닌 카드 결제 데이터 기반 정보입니다.

## 하는 일

- 상권(강남역, 여의도, 성수 등)과 모임 성격(회식, 접대, 점심, 한잔)을 고르면 조건에 맞는 식당 3곳을 보여 준다.
- 식당마다 시군구 매출 상위 %, 회식 적합 표시, 가장 붐비는 요일과 시간대, 주 고객층, 예상 영업시간을 보여 준다.
- `/area/[slug]`는 상권과 업종별 결제 랭킹 리포트다. `sitemap.xml`과 `robots.txt`를 자동 생성한다.
- 조건별 공유 이미지를 `/og`에서 만든다.

## 대회 유입 집계 규칙

- `merUrl`은 서버에서 호출하지 않는다. 파라미터, 단축 URL, 리다이렉트, 중간 페이지 없이 원본 그대로 `<a href={merUrl} target="_blank" rel="noopener">`로 건다. 앵커는 `components/MerLink.tsx` 한 곳에만 있다.
- 모든 응답에 `Referrer-Policy: strict-origin-when-cross-origin`을 건다(`next.config.ts`). `rel="noreferrer"`는 쓰지 않는다.
- 카카오톡, 인스타그램, 스레드 인앱 브라우저에서는 외부 브라우저로 열라는 배너를 띄운다(`components/InappBanner.tsx`).
- 로그인 없이 쓴다.

## 데이터

k-skill 프록시의 잇플 검색 API를 쓴다(`lib/eatpl.ts`). 인증키가 없고 호출당 최대 100건을 시군구 매출 상위 순으로 돌려준다. 프록시 호출 한도가 있어 응답을 6시간 캐시한다. 주요 프랜차이즈는 기본으로 뒤로 내린다(`lib/franchise.ts`).

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm run start
npm run lint
```

Next.js 16(App Router, Cache Components), TypeScript, 순수 CSS. 배포는 Vercel.

## 문서

- `spec.md`: API 스펙과 대회 필수 규칙
- `AGENTS.md`: 코딩 에이전트용 안내(Next.js 버전 주의)

글꼴은 Pretendard(SIL Open Font License, `assets/fonts/Pretendard-LICENSE.txt`).
