const BUSINESS_DAYS_LIMIT = 3;

function isBusinessDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function addBusinessDays(from, days) {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) added += 1;
  }
  return d;
}

function slaDeadline(createdAt) {
  const created =
    createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (!created || Number.isNaN(created.getTime())) return null;
  return addBusinessDays(created, BUSINESS_DAYS_LIMIT);
}

function businessDaysBetween(fromDate, toDate) {
  const from =
    fromDate instanceof Date ? fromDate : new Date(fromDate);
  const to = toDate instanceof Date ? toDate : new Date(toDate);
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) {
      if (cursor <= end) count += 1;
    }
  }
  return count;
}

// Returns "overdue" | "due_soon" | "on_track" | "exempt" | "done"
function slaStateFor(ticket, now = new Date()) {
  const deadline = slaDeadline(ticket.createdAt);
  if (!deadline) return "done";

  if (ticket.status === "in_progress") return "exempt";
  if (ticket.status === "resolved") return "done";

  // open
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const deadlineMs = deadline.getTime();
  if (nowMs > deadlineMs) return "overdue";

  const oneBusinessDayBefore = addBusinessDays(deadline, -1);
  if (nowMs >= oneBusinessDayBefore.getTime()) return "due_soon";

  return "on_track";
}

module.exports = {
  BUSINESS_DAYS_LIMIT,
  slaDeadline,
  businessDaysBetween,
  slaStateFor,
};
