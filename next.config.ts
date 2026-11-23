import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // 메타데이터를 <head>에 넣고 응답하는 봇. 기본 목록에 카카오톡 링크 미리보기 스크래퍼를 보탠다.
  // 기본값 출처: node_modules/next/dist/shared/lib/router/utils/html-bots.js
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|kakaotalk-scrap|Daumoa|NaverBot/i,
  // /og가 fs로 읽는 한글 폰트를 서버 번들에 싣는다.
  outputFileTracingIncludes: {
    "/og": ["./assets/fonts/**/*"],
    "/og/analysis": ["./assets/fonts/**/*"],
  },
  // 대회 유입 집계 규칙 2: 모든 경로에 Referrer-Policy를 건다.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
    ];
  },
};

export default nextConfig;
