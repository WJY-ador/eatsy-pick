# eat.pl 챌린지 프로젝트 스펙 (회식·모임 결정기 + 동네 결제 리포트)

## 1. 대회 배경 및 핵심 목표
- BC카드 '잇플(eat.pl) AI 서비스 수익화 챌린지' 출품작 (12/3 등록 마감, 12/13 집계 종료)
- 평가 기준: 내 도메인 → `eat.pl` 맛집 상세(`merUrl`)로 넘어간 누적 순 사용자(UV)
- 컨셉(A+B):
  - A(메인): 직장인·모임용 '결제 데이터 기반 회식·모임 장소 결정기' (위치+모임성격 → 3곳 추천 + 단톡방 공유 카드)
  - B(보조 SEO): `/area/[slug]` 동네·상권별 결제 랭킹 리포트 + sitemap.xml

## 2. API 스펙 (k-skill 프록시)
- Endpoint: `GET https://k-skill-proxy.nomadamas.org/v1/bccard-eatpl/search`
- Query Params (1개 이상 필수): `location`(주소 부분일치), `merTpbuzNm`(업종), `merNm`(가게명)
- 응답: 인증키 불필요, 최대 100건, `ccgSaleRnk`(시군구 매출 상위 %) 오름차순 반환
- 주요 필드: `merNm`(상호), `merAddr`(주소), `merTpbuzNm`(업종), `allSaleRnk`(전국 상위%), `ccgSaleRnk`(시군구 상위%), `loclPrsnPpltYn`(동네맛집 Y/N), `merUrl`(잇플 상세 URL), `srtTime`/`endTime`(영업 예상시간), `empyVsitYn`(회식 적합 Y/N), `congestionDwk`/`congestionTizn`(붐비는 요일/시간), `vistCstmrRnkList`(주 고객층 rk01~03), `xaxsVal`/`yaxsVal`(TM128 좌표)
- 주의: 날것 순위엔 투썸·메가커피 등 프랜차이즈가 상위로 뜨므로 기본은 프랜차이즈 필터링 필요.

## 3. 집계 및 법적 필수 규칙 (절대 위반 금지)
1. `merUrl`은 서버에서 절대 fetch하지 말 것. 파라미터 추가·단축URL·리다이렉트·중간페이지 금지.
2. 링크는 반드시 원본 그대로 `<a href={merUrl} target="_blank" rel="noopener">` 사용 (`rel="noreferrer"` 절대 금지).
3. 응답 헤더 `Referrer-Policy: strict-origin-when-cross-origin` 필수.
4. 카톡·인스타·스레드 인앱브라우저 감지 시 상단 "Safari/Chrome에서 열기" 안내 배너 노출.
5. 의무 표기: `eat.pl 잇플 · BC카드 결제 데이터 기반` 및 "맛·추천 순위가 아닌 카드 결제 데이터 기반 정보입니다."
6. 로그인 없이 즉시 사용 가능.
