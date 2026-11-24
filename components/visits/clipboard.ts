// 클립보드 복사. 성공 여부만 돌려준다(권한이 막혔거나 지원하지 않으면 false).

export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
