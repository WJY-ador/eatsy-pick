import { MER_LINK_TEXT, isLinkableMerUrl } from "@/lib/site";

/**
 * 잇플 상세로 가는 유일한 앵커(대회 규칙 1). 카드와 표가 같이 쓴다.
 * merUrl은 바꾸지 않고, 평범한 <a>로, target="_blank" rel="noopener"만 쓴다.
 * https://로 시작하지 않으면 그리지 않는다.
 */
export function MerLink({ merUrl, className, label = MER_LINK_TEXT }: { merUrl: string | null | undefined; className?: string; label?: string }) {
  if (!isLinkableMerUrl(merUrl)) return null;
  return (
    <a className={className} href={merUrl} target="_blank" rel="noopener">
      {label}
    </a>
  );
}
