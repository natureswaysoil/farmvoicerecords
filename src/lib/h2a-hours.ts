export function dailyHours(
  shiftHours: string,
  paidBreaks: string,
  unpaidMeals: string,
) {
  const shift = Number(shiftHours),
    paid = Number(paidBreaks),
    unpaid = Number(unpaidMeals);
  const minutes = Math.round(shift * 60);
  if (
    !shiftHours.trim() ||
    !Number.isFinite(shift) ||
    shift <= 0 ||
    minutes < 1 ||
    shift > 24 ||
    !Number.isInteger(paid) ||
    !Number.isInteger(unpaid) ||
    paid < 0 ||
    unpaid < 0 ||
    paid + unpaid > minutes ||
    unpaid >= minutes
  )
    return null;
  return {
    shiftMinutes: minutes,
    paidBreakMinutes: paid,
    unpaidMealMinutes: unpaid,
    hours: Math.round(((minutes - unpaid) / 60) * 100) / 100,
  };
}
export type HoursRow = {
  worker_id: string;
  work_date: string;
  hours_worked: number;
  shift_minutes?: number | null;
  paid_break_minutes?: number | null;
  break_minutes?: number | null;
  approved_at?: string | null;
};
export function weeklyHours(rows: HoursRow[], weekStarts = 1) {
  const groups = new Map<
    string,
    {
      workerId: string;
      week: string;
      minutes: number;
      paid: number;
      unpaid: number;
      pending: number;
      legacy: number;
    }
  >();
  for (const row of rows) {
    const day = new Date(row.work_date + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() - weekStarts + 7) % 7));
    const week = day.toISOString().slice(0, 10),
      key = row.worker_id + ":" + week;
    const group = groups.get(key) ?? {
      workerId: row.worker_id,
      week,
      minutes: 0,
      paid: 0,
      unpaid: 0,
      pending: 0,
      legacy: 0,
    };
    group.minutes +=
      row.shift_minutes == null
        ? Number(row.hours_worked) * 60
        : Number(row.shift_minutes) - Number(row.break_minutes ?? 0);
    group.paid += Number(row.paid_break_minutes ?? 0);
    group.unpaid += Number(row.break_minutes ?? 0);
    group.pending += row.approved_at ? 0 : 1;
    group.legacy += row.shift_minutes == null ? 1 : 0;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.week.localeCompare(a.week) || a.workerId.localeCompare(b.workerId),
  );
}
export const formatMinutes = (minutes: number) =>
  `${Math.floor(Math.round(minutes) / 60)}h ${Math.round(minutes) % 60}m`;
