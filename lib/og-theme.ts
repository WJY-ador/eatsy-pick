// OG 이미지(ImageResponse)는 CSS 변수를 못 읽는다. app/tokens.css 토큰을 sRGB hex로 옮긴 값이다.
// 변환: OKLCH → OKLab → linear sRGB → sRGB(감마), 2026-11-23 계산. 토큰을 바꾸면 여기도 바꾼다.
export const OG_COLORS = {
  paper: "#fefcfb", // oklch(99.3% 0.002 60)
  paper2: "#f6f4f2", // oklch(96.8% 0.003 60)
  paper3: "#ece9e7", // oklch(93.6% 0.004 60)
  ink: "#15181e", // oklch(21% 0.012 260)
  ink2: "#3c4046", // oklch(37% 0.012 260)
  muted: "#606369", // oklch(50% 0.01 260)
  accent: "#d23800", // oklch(57% 0.2 38), 흰 글자 대비 4.78:1
} as const;
