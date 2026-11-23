// OG 이미지(ImageResponse)는 CSS 변수를 못 읽는다. app/tokens.css 토큰을 sRGB hex로 옮긴 값이다.
// 변환: OKLCH → OKLab → linear sRGB → sRGB(감마), 2026-11-23 계산. 토큰을 바꾸면 여기도 바꾼다.
export const OG_COLORS = {
  paper: "#fdfeff", // --color-panel oklch(99.6% 0.002 260)
  paper2: "#f2f4f6", // --color-bg oklch(96.6% 0.003 260)
  paper3: "#e8e9ec", // oklch(93.5% 0.004 260)
  ink: "#1c1f25", // --color-ink oklch(24% 0.012 260)
  ink2: "#3f4349", // --color-ink-2 oklch(38% 0.012 260)
  muted: "#5d6166", // --color-muted oklch(49% 0.01 260)
  rule: "#dee0e2", // --color-rule oklch(90.5% 0.004 260)
  data: "#1161bb", // --color-data oklch(50% 0.16 256), 흰 글자 대비 6.09:1
  accent: "#d23800", // --color-cta, 흰 글자 대비 4.78:1
} as const;
