# eatsy-pick

BC카드 잇플(eat.pl) AI 서비스 수익화 챌린지 출품작. 내 주변에서 갈 곳을 고르고, 카드 결제 근거를 확인하고, 다녀온 뒤 남긴 반응을 다음 약속에 다시 쓰는 결제 데이터 지도다.

- 서비스: https://eatsy-pick.vercel.app
- 데이터: `eat.pl 잇플 · BC카드 결제 데이터 기반`. 맛·추천 순위가 아닌 카드 결제 데이터 기반 정보입니다.

## 하는 일

- **근처 후보** (`/`): 상권 칩, 음식과 가게와 동네 검색, 내 주변 보기로 범위를 고르면 지도와 가까운 후보(최대 100곳)를 보여 준다. 매장마다 시군구 상위 %, 고객층 1위, 동네맛집과 회식 적합 표시를 태그로 붙이고 프랜차이즈를 기본으로 뺀다. 음식 검색(예: 고기)은 그 지역의 업종 조회다.
- **근거 차트**: 태그를 누르면 현재 조회 범위의 같은 업종과 견준 차트를 그 자리에서 펼친다. 비교 범위와 분모를 문장으로 적고, 값이 없는 매장은 따로 센다. 차트를 열 때 API를 다시 부르지 않는다.
- **결제 영수증**: 매장명이나 지도 핀을 누르면 시군구와 전국 매출 상위 %, 고객층 1~3위, 대표 피크, 예상 영업시간, 회식 적합 표시, 동네맛집 표시를 영수증 꼴로 보여 준다. 백분위는 API 원본 수치 그대로 쓴다.
- **방문 기록과 다음 약속**: 저장, 다녀왔어요, 다시 갈래요 또는 다른 곳 볼래요를 기기에만 남긴다. 다음에 같은 범위를 볼 때 다시 가고 싶다고 남긴 곳과 BC카드 결제 근거가 있는 새 후보를 이유와 함께 보여 준다. 저장과 잇플 링크 클릭은 방문으로 세지 않는다.
- **상권 분석** (`/analysis`): 상권 칩과 동네 검색으로 상권을 바꿔 가며 KPI 4개, 요일과 시간대별 대표 피크 표, 고객층과 업종 막대를 교차 필터로 본다. 필터는 받은 응답 위에서만 계산하고 API를 다시 부르지 않는다. 필터 상태를 담은 공유 링크와 `/og/analysis` 이미지를 만든다.
- **상권별 결제 랭킹** (`/area/[slug]`): 상권과 업종별 리포트, `sitemap.xml`, `robots.txt`.

## 지키는 것

대회 유입 집계 규칙
- `merUrl`은 서버에서 호출하지 않는다. 파라미터, 단축 URL, 리다이렉트, 중간 페이지 없이 원본 그대로 `<a href={merUrl} target="_blank" rel="noopener">`로 건다. 앵커는 `components/MerLink.tsx` 한 곳에만 있고 클릭 핸들러가 없다.
- 모든 응답에 `Referrer-Policy: strict-origin-when-cross-origin`을 건다(`next.config.ts`). `rel="noreferrer"`는 쓰지 않는다.
- 카카오톡, 인스타그램, 스레드 인앱 브라우저에서는 외부 브라우저로 열라는 배너를 띄운다.
- 로그인 없이 쓴다.

데이터 표기
- API는 호출당 최대 100곳을 시군구 매출 상위 순으로 돌려준다. 화면에 실제 조회 범위와 반환 수를 적고, 범위 안 전체 매장이라고 쓰지 않는다.
- 매출액, 결제 건수, 실시간 혼잡도, 평점, 만족도는 만들지 않는다. `loclPrsnPpltYn`은 동네맛집 표시, `empyVsitYn`은 회식 적합 표시로만 적는다.
- 예상 영업시간은 최근 1개월 결제 승인 시각 기준 추정이다.

위치
- 정밀 좌표는 기기 메모리에만 둔다. 주소, 공유 링크, OG, 서버 요청에 넣지 않는다. 거리 계산은 브라우저에서 한다.
- 동네 이름은 OpenStreetMap Nominatim으로 찾는다. 좌표를 소수 3자리(약 100m)로 줄여 보내고, 같은 위치는 세션 동안 다시 묻지 않는다. `NEXT_PUBLIC_GEOCODER=preset`이면 Nominatim을 끄고 준비된 상권 중 가장 가까운 곳으로 대신한다(`lib/geocode.ts`).
- 지도는 `NEXT_PUBLIC_KAKAO_MAP_KEY`(카카오 JavaScript 키)가 있으면 카카오 지도, 없거나 로드에 실패하면 Leaflet과 OpenStreetMap 타일을 쓴다(`lib/map-provider.ts`, `components/StoreMap.tsx`). 위치 처리 안내는 `/privacy`에 있다.

## 구조

- `lib/eatpl.ts`: k-skill 프록시의 잇플 검색 API. 프록시 호출 한도가 있어 응답을 6시간 캐시한다.
- `lib/stores.ts`: 매장 정규화, 중복 정리, TM128 좌표의 WGS84 변환(`proj4`), 상권 조회.
- `lib/brands.ts`, `lib/franchise.ts`: 프랜차이즈 판정. 브랜드 목록 한 곳에 이름, 별칭, 출처 URL을 두고 모든 화면이 같은 판정을 쓴다. 브랜드를 더하거나 고칠 때는 이 목록만 바꾼다.
- `lib/evidence.ts`, `components/evidence`: 근거 차트 계산과 그리기.
- `lib/food.ts`: 음식 표현과 업종의 대응표.
- `lib/analytics.ts`: 상권 분석 집계와 교차 필터(순수 함수).
- `lib/visits.ts`, `lib/plan.ts`: 기기 저장 방문 기록과 다음 약속 후보 고르기.
- `components/home`, `components/analysis`, `components/visits`, `components/StoreMap.tsx`(카카오 또는 Leaflet).

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm run start
npm run lint
```

Next.js 16(App Router, Cache Components), TypeScript, 순수 CSS. 배포는 Vercel.

## 문서

- `spec.md`: API 스펙, 대회 필수 규칙, 개편 스펙
- `AGENTS.md`: 코딩 에이전트용 안내(Next.js 버전 주의)

글꼴은 Pretendard(SIL Open Font License, `assets/fonts/Pretendard-LICENSE.txt`).
