"use client";

import "@/app/catimg.css";
import { useState } from "react";
import { CATEGORY_IMAGES, imageKeyOf } from "@/lib/category-image";

/**
 * 카드 위 16:9 업종 참고 이미지. 상자 높이는 aspect-ratio로 고정해 로드 전, 후, 실패에 같다.
 * 사진은 가게 이름의 메뉴 낱말, 없으면 업종 값으로 고른다(lib/category-image.ts imageKeyOf). name이 없으면 업종 값만 본다.
 * 대응이 없거나 로드에 실패하면 중립 플레이스홀더(단색 선 아이콘)를 쓴다. 실제 매장 사진으로 읽히지 않게 표시를 얹는다.
 */
export function CategoryImage({
  category,
  name,
  className,
  priority = false,
}: {
  category: string | null | undefined;
  name?: string;
  className?: string;
  priority?: boolean;
}) {
  const key = imageKeyOf({ name, category });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const img = key ? CATEGORY_IMAGES[key] : null;
  const photo = img !== null && failedSrc !== img.src;
  const cls = className ? `catimg ${className}` : "catimg";

  return (
    <div className={cls} data-testid="cat-image" data-kind={photo ? "photo" : "placeholder"} data-group={key ?? undefined}>
      {photo ? (
        <>
          {/* 미리 잘라 둔 정적 webp 두 장을 srcSet으로 고른다. 이미지 최적화 서버를 거치지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="catimg__img"
            src={img.src}
            srcSet={img.srcSet}
            sizes="(min-width: 64rem) 280px, (min-width: 48rem) 33vw, 75vw"
            width={img.width}
            height={img.height}
            alt={`${img.label} 업종 참고 이미지`}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            onError={() => setFailedSrc(img.src)}
            ref={(el) => {
              // hydration 전에 이미 실패한 이미지는 onError가 다시 오지 않는다
              if (el && el.complete && el.naturalWidth === 0) setFailedSrc(img.src);
            }}
          />
          <span className="catimg__note" aria-hidden="true">
            업종 참고 이미지
          </span>
        </>
      ) : (
        <span className="catimg__ph" role="img" aria-label="업종 이미지 없음">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
            <path d="M3.5 12.5h17a8.5 8.5 0 0 1-17 0Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 9.5c0-1.2 1-1.6 1-2.8S9 5 9 4M14 9.5c0-1.2 1-1.6 1-2.8S14 5 14 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </div>
  );
}
