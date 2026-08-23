(function () {
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

  // "overdue" | "due_soon" | "on_track" | "exempt" | "done"
  function slaState(ticket, now = new Date()) {
    const deadline = slaDeadline(ticket.createdAt);
    if (!deadline) return "done";

    if (ticket.status === "in_progress") return "exempt";
    if (ticket.status === "resolved") return "done";

    const nowMs =
      now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (nowMs > deadline.getTime()) return "overdue";

    const oneBusinessDayBefore = addBusinessDays(deadline, -1);
    if (nowMs >= oneBusinessDayBefore.getTime()) return "due_soon";

    return "on_track";
  }

  function businessDaysOverdue(ticket, now = new Date()) {
    const deadline = slaDeadline(ticket.createdAt);
    if (!deadline) return 0;
    const to = now instanceof Date ? now : new Date(now);
    let count = 0;
    const cursor = new Date(deadline);
    while (cursor < to) {
      cursor.setDate(cursor.getDate() + 1);
      if (isBusinessDay(cursor) && cursor <= to) count += 1;
    }
    return Math.max(count, to > deadline ? 1 : 0);
  }

  window.SLA = { slaDeadline, slaState, businessDaysOverdue };
})();
