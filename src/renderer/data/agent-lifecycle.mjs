// 智能体生命周期：从推广日起算一个周期（默认 6 个月），周期内没有客户购买就下线；有人买就一直在线。
// 数据存在宣传物料里智能体文件夹的 lifecycle 字段：{ launchAt: 'YYYY-MM-DD', months, purchases: [{ id, customer, date }] }
export const DEFAULT_MONTHS = 6;
export const WARN_DAYS = 30;
const DAY = 86400000;

export function today(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };

// 加月份：月底按目标月最后一天算（8/31 + 6 个月 = 2/28 或 2/29）
export function addMonths(date, months) {
  const d = parse(date), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return today(d);
}

// status: none 未设置 / pending 未开始推广 / active 推广中 / expiring 即将到期 / sold 已有客户购买 / offline 已下线
export function lifecycleStatus(lifecycle, now = today()) {
  if (!lifecycle?.launchAt) return { status: 'none', label: '未设置周期' };
  const months = lifecycle.months || DEFAULT_MONTHS;
  const expiresAt = addMonths(lifecycle.launchAt, months);
  const purchases = (lifecycle.purchases || []).filter(p => p.date && p.date <= now);
  const total = Math.round((parse(expiresAt) - parse(lifecycle.launchAt)) / DAY);
  const daysLeft = Math.round((parse(expiresAt) - parse(now)) / DAY);
  const base = { launchAt: lifecycle.launchAt, months, expiresAt, purchases, daysLeft, progress: Math.min(1, Math.max(0, 1 - daysLeft / total)) };
  if (purchases.length) return { ...base, status: 'sold', label: `已有 ${purchases.length} 家客户购买` };
  if (now < lifecycle.launchAt) return { ...base, status: 'pending', label: `${lifecycle.launchAt.slice(5).replace('-', '/')} 开始推广` };
  if (daysLeft <= 0) return { ...base, status: 'offline', label: '推广结束' };
  if (daysLeft <= WARN_DAYS) return { ...base, status: 'expiring', label: `还剩 ${daysLeft} 天` };
  return { ...base, status: 'active', label: `推广中 · 剩 ${daysLeft} 天` };
}
