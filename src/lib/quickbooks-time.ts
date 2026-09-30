export function netDuration(
  clockIn: string,
  clockOut: string,
  breakMinutes = 0,
) {
  const elapsed = (Date.parse(clockOut) - Date.parse(clockIn)) / 60000;
  if (
    !Number.isFinite(elapsed) ||
    elapsed <= 0 ||
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0 ||
    breakMinutes >= elapsed
  )
    throw new Error("Invalid time entry or break duration.");
  const total = Math.round(elapsed - breakMinutes);
  if (total < 1)
    throw new Error("Time entry must contain at least one payable minute.");
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
