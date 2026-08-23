const { getDb } = require("./index");
const { slaDeadline, slaStateFor, businessDaysBetween, BUSINESS_DAYS_LIMIT } = require("./sla");

function startOfWeekIso() {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysSinceMonday
  );
  return monday.toISOString();
}

function scopeClause(user) {
  if (user.role === "admin" || user.role === "analysts") {
    return { sql: "", params: [] };
  }
  return { sql: " AND t.created_by_uid = ?", params: [user.uid] };
}

function hoursBetween(fromIso, toMs) {
  const from = new Date(fromIso).getTime();
  if (!from || Number.isNaN(from)) return null;
  return Math.max(0, (toMs - from) / 3600000);
}

function summarizeDurations(hoursList) {
  if (!hoursList.length) {
    return { count: 0, avgHours: null, minHours: null, maxHours: null };
  }
  const sum = hoursList.reduce((a, b) => a + b, 0);
  return {
    count: hoursList.length,
    avgHours: sum / hoursList.length,
    minHours: Math.min(...hoursList),
    maxHours: Math.max(...hoursList),
  };
}

function getAnalyticsForUser(user) {
  const db = getDb();
  const scope = scopeClause(user);
  const weekStart = startOfWeekIso();
  const nowMs = Date.now();

  const weeklyCategories = db
    .prepare(
      `SELECT t.issue_type AS category, COUNT(*) AS count
       FROM tickets t
       WHERE t.created_at >= ?${scope.sql}
       GROUP BY t.issue_type
       ORDER BY count DESC, category ASC`
    )
    .all(weekStart, ...scope.params);
  const weeklyTotal = weeklyCategories.reduce((sum, r) => sum + r.count, 0);

  const resolvedRows = db
    .prepare(
      `SELECT t.id, t.created_at, MAX(a.created_at) AS resolved_at
       FROM tickets t
       JOIN activity_logs a
         ON a.ticket_id = t.id AND a.action = 'status_changed' AND a.to_status = 'resolved'
       WHERE t.status = 'resolved'${scope.sql}
       GROUP BY t.id`
    )
    .all(...scope.params);
  const resolveHours = resolvedRows
    .map((r) => hoursBetween(r.created_at, new Date(r.resolved_at).getTime()))
    .filter((h) => h != null);
  const resolved = summarizeDurations(resolveHours);

  const buckets = { under1d: 0, d1to3: 0, d3to7: 0, over7d: 0 };
  for (const h of resolveHours) {
    if (h < 24) buckets.under1d += 1;
    else if (h < 72) buckets.d1to3 += 1;
    else if (h < 168) buckets.d3to7 += 1;
    else buckets.over7d += 1;
  }

  const progressRows = db
    .prepare(
      `SELECT t.id, t.created_at, MAX(a.created_at) AS entered_at
       FROM tickets t
       LEFT JOIN activity_logs a
         ON a.ticket_id = t.id AND a.action = 'status_changed' AND a.to_status = 'in_progress'
       WHERE t.status = 'in_progress'${scope.sql}
       GROUP BY t.id`
    )
    .all(...scope.params);
  const progressHours = progressRows.map((r) => {
    const anchor = r.entered_at || r.created_at;
    return hoursBetween(anchor, nowMs);
  });
  const inProgress = summarizeDurations(progressHours);

  const sla = computeSla(db, scope);

  return {
    weekStart,
    weeklyTotal,
    weeklyCategories,
    speed: {
      resolved,
      buckets,
      inProgress,
    },
    sla,
  };
}

function computeSla(db, scope) {
  const now = new Date();

  const openRows = db
    .prepare(
      `SELECT t.id, t.status, t.created_at
       FROM tickets t
       WHERE t.status IN ('open', 'in_progress')${scope.sql}`
    )
    .all(...scope.params);

  let overdue = 0;
  let dueSoon = 0;
  let onTrack = 0;
  let exempt = 0;
  for (const row of openRows) {
    const state = slaStateFor(
      { status: row.status, createdAt: row.created_at },
      now
    );
    if (state === "overdue") overdue += 1;
    else if (state === "due_soon") dueSoon += 1;
    else if (state === "exempt") exempt += 1;
    else onTrack += 1;
  }

  const resolvedRows = db
    .prepare(
      `SELECT t.id, t.created_at, MAX(a.created_at) AS resolved_at
       FROM tickets t
       JOIN activity_logs a
         ON a.ticket_id = t.id AND a.action = 'status_changed' AND a.to_status = 'resolved'
       WHERE t.status = 'resolved'${scope.sql}
       GROUP BY t.id`
    )
    .all(...scope.params);

  let resolvedOnTime = 0;
  let resolvedLate = 0;
  let lateBusinessDaysSum = 0;
  for (const row of resolvedRows) {
    const deadline = slaDeadline(row.created_at);
    if (!deadline) continue;
    const resolvedAt = new Date(row.resolved_at);
    if (resolvedAt <= deadline) {
      resolvedOnTime += 1;
    } else {
      resolvedLate += 1;
      lateBusinessDaysSum +=
        businessDaysBetween(deadline, resolvedAt) || 0;
    }
  }

  return {
    businessDaysLimit: BUSINESS_DAYS_LIMIT,
    open: { overdue, dueSoon, onTrack, exempt, total: openRows.length },
    resolved: {
      total: resolvedRows.length,
      onTime: resolvedOnTime,
      late: resolvedLate,
      avgLateBusinessDays: resolvedLate
        ? lateBusinessDaysSum / resolvedLate
        : null,
    },
  };
}

module.exports = { getAnalyticsForUser, startOfWeekIso };
