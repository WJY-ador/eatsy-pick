@AGENTS.md

# eatsy-pick 작업 규칙

BC카드 잇플 결제 데이터로 맛집과 상권을 보여 주는 Next.js 앱. 운영 https://eatsy-pick.vercel.app. 명세는 `spec.md`(상단 정리 절이 사용자 원문 절보다 우선).

## 역할

- 메인은 관제탑이다. 판단, 조율, 병합, 커밋, 기록을 맡고 앱 코드 수정은 opus 서브 에이전트에 맡긴다.
- 에이전트는 주제마다 git worktree 하나(`git worktree add <scratchpad>/<주제> -b <브랜치> HEAD`, node_modules는 `cp -c -R`)에서 고치고, 커밋은 메인이 한다. 같은 파일을 여러 에이전트가 고치면 메인이 3방향 병합한다.
- 로직은 Claude만 고친다. Codex는 `spec.md`와 블로그 작업트리(`~/Personal/_workspace/eatsy-blog`)만 맡는다. Codex가 로직을 건드린 흔적이 보이면 사용자에게 알린다.

## 검증 (2026-11-24 시행, 시험 중)

- 에이전트 단계: 고칠 자리를 `rg`와 파일 머리 주석으로 찾아 그 부분만 고치고, `npx tsc --noEmit`와 `npm run lint`로 끝낸다.
- 통합 단계에서 한 번: 전체 build, gate, 메인이 직접 하는 Ego 확인. 걸린 부분만 고쳐 다시 검증한다.
- 대기 시간 감시: 이 방식으로 사용자 대기가 이전(에이전트마다 build와 브라우저 확인)보다 길어지면, 메인이 이전 방식으로 되돌리거나 다른 방안을 사용자에게 제시한다.

## 화면 문구

- 후보, 추정처럼 불확실한 말, 가운뎃점, 낫표, 이모지를 쓰지 않는다. 예외는 의무 표기 원문(`lib/site.ts`).
- 잇플 원본 링크(paybooc.ai)는 받은 문자열 그대로 연다.
- 사용자 요청에 든 예시 문구는 형태 참고이고 명세가 아니다.

## 실행과 배포

- 카카오 지도는 등록 주소 `http://localhost:3000`에서만 뜬다. 다른 포트는 Leaflet으로 넘어간다. 3000은 한 번에 한 에이전트만 쓴다.
- 키를 넣은 빌드와 실행: 이전 세션 scratchpad의 `kbuild.sh <폴더> build|start [포트]`(키 파일 경로를 담고 있다. scratchpad라 재부팅이면 사라질 수 있다).
- 배포: main 스냅샷 폴더에 `.vercel`(projectName eatsy-pick)을 넣고 `npx vercel deploy --prod --yes`. push는 사용자가 `! git push`로 한다.
- 커밋: 앱 코드, 블로그 스크립트, `spec.md`를 따로 커밋한다.
