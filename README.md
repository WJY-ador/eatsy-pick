# eatsy pick

별점, 광고 말고 BC카드 실제 결제 데이터로 동네 가게를 고르는 웹서비스.
BC카드 잇플(eat.pl) AI 서비스 수익화 챌린지 출품작.

운영: https://eatsy-pick.vercel.app

*A web service for picking where to eat from real BC Card payment data instead of ratings and ads. Entry for BC Card's eat.pl AI service challenge.*

## 무엇을 하나

| 화면 | 주소 | 하는 일 |
|:--|:--|:--|
| 홈 | `/` | 처음 들어오면 위치를 물어 내 주변 기준으로 보여 준다. 거부하면 강남역 상권으로 시작한다. 지도와 가게 목록, 매출 상위 1%, 동네맛집, 회식 적합 테마, 프랜차이즈 제외 토글. |
| 오늘 뭐먹지 | 홈 우측 하단 | 웹챗. 잇플 업종 분류(AI 업종 34종, 대분류 9종)를 칩으로 누르거나 입력해 고르면, 지금 지역에서 그 업종을 다시 조회해 매출 상위 가게를 보여 준다. |
| 상권 랭킹 | `/area` | 상권마다 업종별 상위 가게를 카드형 행으로. 업종 참고 이미지, 시군구 매출 상위 %, 대표 피크 요일과 시간대, 주 고객층 1위. |
| 맛집 둘러보기 | `/analysis` | 상권의 업종 구성, 대표 피크 표, 주 고객층, 동네맛집과 회식 적합 비중. |
| 내 저장 | `/list` | 가게 저장, 방문 기록, 공유. 로그인 없이 기기 안에만 저장한다. |

모든 가게 카드는 잇플 원본 상세(`merUrl`)로 바로 이어진다.

## 데이터와 해석

데이터는 BC카드 잇플 가맹점 검색 응답을 k-skill 프록시로 조회한다. 지표 해석은 [잇플 API 정의서](https://eatpl.dothome.co.kr/api/)를 따른다.

- `ccgSaleRnk`: 같은 시군구, 같은 업종 안의 매출 백분위. 화면에는 원본 값 그대로 `강남구 매출 상위 N%`로 쓴다. 서로 다른 시군구의 가게를 이 값으로 한 줄로 비교하지 않는다.
- `congestionDwk`, `congestionTizn`: 최근 1개월 결제로 본 가장 붐비는 요일과 시간대. 지금의 혼잡이나 대기 시간이 아니다.
- `loclPrsnPpltYn`(동네맛집), `empyVsitYn`(회식 적합): 표시가 있는 매장만 이름을 단다.
- 조회 한 번에 돌려받는 매장 수에 한도가 있어, 화면의 매장 수는 조회 범위 안의 표본이다. 실시간 혼잡, 맛, 예약 여부는 다루지 않는다.

대회 의무 표기(원문 그대로):

> eat.pl 잇플 · BC카드 결제 데이터 기반
> 맛·추천 순위가 아닌 카드 결제 데이터 기반 정보입니다.

## 기술

- Next.js 16.4, React 19.3, TypeScript
- 지도: 카카오 지도 JS SDK. 키가 없거나 등록 주소 밖이면 Leaflet과 OpenStreetMap으로 넘어간다. 좌표 변환은 proj4(TM128).
- 주소 변환: 카카오, 실패하면 OpenStreetMap Nominatim, 그다음 기본 상권.
- 배포: Vercel. 측정: GA4(측정 ID가 있을 때만 로드).

## 로컬 실행

```bash
npm install
npm run dev   # http://localhost:3000
```

환경 변수(`.env.local`, 모두 선택. 없으면 해당 기능만 빠진다):

| 이름 | 쓰임 |
|:--|:--|
| `KAKAO_REST_KEY` | 서버의 카카오 장소 검색과 지역 풀이 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 지도와 브라우저 주소 변환. 카카오 개발자 콘솔에 등록한 주소에서만 뜬다. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 |
| `NEXT_PUBLIC_GEOCODER=preset` | 외부 주소 변환을 끄고 기본 상권만 쓴다 |

## 작업 방식

제품 정의와 결정은 [`spec.md`](spec.md)에 쌓는다. 구현은 Claude Code가 주제마다 git worktree 하나에서 서브 에이전트로 하고, 통합 단계에서 build와 브라우저 확인을 한 번 한다. 작업 규칙은 [`CLAUDE.md`](CLAUDE.md).
