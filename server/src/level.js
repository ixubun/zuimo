/**
 * Hệ thống cấp độ.
 *
 * Mỗi cấp cần nhiều XP hơn cấp trước: cấp 1→2 cần 100 XP, sau đó mỗi cấp cộng thêm 50 XP.
 * need(n) = 100 + (n-1)*50  ->  tổng XP để đạt cấp n = 25n² + 25n - 50
 * Tăng tuyến tính (không phải hàm mũ) để người học đều đặn vẫn thấy tiến bộ,
 * nhưng vẫn đủ dốc để cấp cao có ý nghĩa.
 */
const BASE = 100, STEP = 50;

/** Tổng XP tích luỹ cần có để ĐẠT cấp n (n >= 1). */
export const xpToReach = (n) => (n <= 1 ? 0 : ((n - 1) * (2 * BASE + (n - 2) * STEP)) / 2);

/** Danh hiệu theo mốc cấp; dùng chung giữa API và giao diện để không lệch nhau. */
export function rankOf(level) {
  if (level >= 40) return { key: 'master', vi: 'Cao thủ', en: 'Master' };
  if (level >= 25) return { key: 'expert', vi: 'Thành thạo', en: 'Expert' };
  if (level >= 15) return { key: 'advanced', vi: 'Nâng cao', en: 'Advanced' };
  if (level >= 8) return { key: 'intermediate', vi: 'Trung cấp', en: 'Intermediate' };
  if (level >= 3) return { key: 'beginner', vi: 'Sơ cấp', en: 'Beginner' };
  return { key: 'newbie', vi: 'Nhập môn', en: 'Starter' };
}

/** Từ tổng XP suy ra cấp hiện tại, XP đã vào cấp, XP cần cho cấp kế tiếp. */
export function levelFromXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpToReach(level + 1) <= x) level += 1;
  const floor = xpToReach(level), next = xpToReach(level + 1);
  return {
    level,
    xp: x,
    into: x - floor,                 // XP đã tích trong cấp hiện tại
    need: next - floor,              // XP cần để qua cấp
    toNext: next - x,
    percent: Math.round(((x - floor) / (next - floor)) * 100),
    rank: rankOf(level)
  };
}
