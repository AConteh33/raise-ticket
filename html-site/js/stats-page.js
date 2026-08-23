(function () {
  const C = window.APP_CONSTANTS;
  let tickets = [];
  let unsubscribe = null;
  let statusFilter = "all";
  let officerFilter = "all";
  let breakdown = true;
  let analytics = null;
  let formConfig = null;
  let rangePreset = "all";
  let rangeFrom = "";
  let rangeTo = "";

  function rangeBounds() {
    const now = new Date();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    switch (rangePreset) {
      case "week": {
        const daysSinceMonday = (now.getDay() + 6) % 7;
        const monday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - daysSinceMonday
        );
        return [monday, endOfToday];
      }
      case "7d":
        return [new Date(now.getTime() - 6 * 86400000), endOfToday];
      case "30d":
        return [new Date(now.getTime() - 29 * 86400000), endOfToday];
      case "month":
        return [new Date(now.getFullYear(), now.getMonth(), 1), endOfToday];
      case "custom": {
        const from = rangeFrom ? new Date(`${rangeFrom}T00:00:00`) : null;
        const to = rangeTo ? new Date(`${rangeTo}T23:59:59.999`) : null;
        return [from, to];
      }
      default:
        return [null, null];
    }
  }

  function ticketsInRange(list) {
    const [from, to] = rangeBounds();
    return list.filter((t) => {
      const created =
        t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt);
      if (Number.isNaN(created.getTime())) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }

  function rangeLabelText() {
    if (rangePreset === "all") return "All time";
    const [from, to] = rangeBounds();
    const fmt = (d) =>
      d?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || "…";
    return `${fmt(from)} – ${rangePreset === "custom" && !rangeTo ? "today" : fmt(to)}`;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function categoryLabel(value) {
    const field = (formConfig?.fields || []).find((f) => f.id === "issueType");
    const opt = (field?.options || []).find((o) => o.value === value);
    if (opt) return opt.label;
    if (!value) return "Unspecified";
    return value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function fmtHours(hours) {
    if (hours == null || Number.isNaN(hours)) return "—";
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 48) return `${Math.round(hours)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  function renderTrends() {
    const catHost = document.getElementById("trend-categories");
    const offHost = document.getElementById("trend-officers");
    const caption = document.getElementById("trend-caption");
    if (!catHost || !offHost) return;

    const scoped = ticketsInRange(tickets);
    if (caption) {
      caption.textContent = `${scoped.length} case(s) · ${rangeLabelText()}`;
    }

    const byCategory = new Map();
    for (const t of scoped) {
      const key = t.issueType || "unspecified";
      byCategory.set(key, (byCategory.get(key) || 0) + 1);
    }
    const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    catHost.innerHTML = cats.length
      ? renderRanking(
          cats.map(([value, count]) => ({
            label: categoryLabel(value),
            value,
            count,
          }))
        )
      : '<p class="stats-caption">No cases in this period.</p>';

    const byOfficer = new Map();
    for (const t of scoped) {
      const key = t.complianceOfficer || "—";
      byOfficer.set(key, (byOfficer.get(key) || 0) + 1);
    }
    const officers = [...byOfficer.entries()].sort((a, b) => b[1] - a[1]);
    offHost.innerHTML = officers.length
      ? renderRanking(
          officers.map(([value, count]) => ({
            label: Stats.officerLabel(value, tickets),
            value,
            count,
          }))
        )
      : '<p class="stats-caption">No cases in this period.</p>';
  }

  function renderRanking(items) {
    const max = Math.max(...items.map((i) => i.count));
    const total = items.reduce((sum, i) => sum + i.count, 0);
    return `
      <div class="cat-list">
        ${items
          .map(
            (i) => `
          <div class="cat-row" title="${esc(i.label)}: ${i.count} of ${total} (${Math.round((i.count / total) * 100)}%)">
            <span class="cat-name">${esc(i.label)}</span>
            <span class="cat-track"><span class="cat-fill" style="width:${((i.count / max) * 100).toFixed(1)}%"></span></span>
            <span class="cat-count">${i.count}<span class="cat-share">${Math.round((i.count / total) * 100)}%</span></span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function setupRangeControls() {
    const presets = document.getElementById("range-presets");
    const customBox = document.getElementById("range-custom");
    if (!presets) return;

    presets.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.onclick = () => {
        rangePreset = btn.dataset.preset;
        presets.querySelectorAll(".filter-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        customBox.classList.toggle("hidden", rangePreset !== "custom");
        rerender();
      };
    });

    const fromInput = document.getElementById("range-from");
    const toInput = document.getElementById("range-to");
    fromInput.onchange = () => {
      rangeFrom = fromInput.value;
      rerender();
    };
    toInput.onchange = () => {
      rangeTo = toInput.value;
      rerender();
    };
  }

  function updateCaption() {
    const caption = document.getElementById("stats-caption");
    if (!caption) return;
    const parts = [];
    if (officerFilter !== "all") {
      parts.push(Stats.officerLabel(officerFilter, tickets));
    }
    if (statusFilter !== "all") {
      parts.push(C.STATUS_LABELS[statusFilter] || statusFilter);
    }
    const scoped = tickets.filter(
      (t) =>
        (statusFilter === "all" || t.status === statusFilter) &&
        (officerFilter === "all" || t.complianceOfficer === officerFilter)
    );
    caption.textContent = parts.length
      ? `${scoped.length} case(s) — ${parts.join(" · ")}`
      : "";
  }

  function rerender() {
    const overviewCaption = document.getElementById("overview-caption");
    if (overviewCaption) {
      overviewCaption.textContent = `${ticketsInRange(tickets).length} case(s) · ${rangeLabelText()}`;
    }

    Stats.renderInto(document.getElementById("stats-table"), {
      tickets: ticketsInRange(tickets),
      statusFilter,
      officerFilter,
      showOfficerBreakdown: breakdown,
      onStatusFilter: (key) => {
        statusFilter = key === statusFilter && key !== "all" ? "all" : key;
        rerender();
      },
      onOfficerFilter: (value) => {
        if (!breakdown) return;
        officerFilter = value === officerFilter ? "all" : value;
        rerender();
      },
    });
    updateCaption();
    renderWeek();
    renderSpeed();
    renderSla();
    renderTrends();
  }

  function renderWeek() {
    const host = document.getElementById("week-categories");
    const rangeEl = document.getElementById("week-range");
    if (!host || !analytics) return;

    if (rangeEl && analytics.weekStart) {
      const start = new Date(analytics.weekStart);
      rangeEl.textContent = `New cases since ${start.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })} — ${analytics.weeklyTotal} so far`;
    }

    const cats = analytics.weeklyCategories || [];
    if (!cats.length) {
      host.innerHTML =
        '<p class="stats-caption">No new cases logged this week yet.</p>';
      return;
    }
    const max = Math.max(...cats.map((c) => c.count));
    host.innerHTML = `
      <div class="cat-list">
        ${cats
          .map(
            (c) => `
          <div class="cat-row">
            <span class="cat-name">${esc(categoryLabel(c.category))}</span>
            <span class="cat-track"><span class="cat-fill" style="width:${((c.count / max) * 100).toFixed(1)}%"></span></span>
            <span class="cat-count">${c.count}</span>
          </div>`
          )
          .join("")}
      </div>`;
  }

  function metricCard(value, label, cls = "") {
    return `
      <div class="metric-card${cls ? ` ${cls}` : ""}">
        <span class="metric-value">${esc(value)}</span>
        <span class="metric-label">${esc(label)}</span>
      </div>`;
  }

  function bucketRow(label, count, total) {
    const pct = total ? (count / total) * 100 : 0;
    return `
      <div class="cat-row">
        <span class="cat-name">${esc(label)}</span>
        <span class="cat-track"><span class="cat-fill cat-fill--green" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="cat-count">${count}</span>
      </div>`;
  }

  function renderSpeed() {
    const host = document.getElementById("speed-panel");
    if (!host || !analytics) return;
    const s = analytics.speed || {};
    const resolved = s.resolved || { count: 0 };
    const buckets = s.buckets || {};
    const progress = s.inProgress || { count: 0 };

    const bucketTotal = resolved.count;
    host.innerHTML = `
      <p class="analytics-subtitle">Time from case creation to resolution</p>
      <div class="metric-grid">
        ${metricCard(resolved.count, "Resolved cases")}
        ${metricCard(fmtHours(resolved.avgHours), "Avg time to resolve")}
        ${metricCard(fmtHours(resolved.minHours), "Fastest")}
        ${metricCard(fmtHours(resolved.maxHours), "Slowest")}
      </div>
      ${
        resolved.count
          ? `<div class="cat-list">
              ${bucketRow("Under 24 hours", buckets.under1d || 0, bucketTotal)}
              ${bucketRow("1–3 days", buckets.d1to3 || 0, bucketTotal)}
              ${bucketRow("3–7 days", buckets.d3to7 || 0, bucketTotal)}
              ${bucketRow("Over a week", buckets.over7d || 0, bucketTotal)}
            </div>`
          : '<p class="stats-caption">No resolved cases yet.</p>'
      }
      <p class="analytics-subtitle" style="margin-top:1.25rem">Currently in progress</p>
      <div class="metric-grid">
        ${metricCard(progress.count, "In progress now")}
        ${metricCard(fmtHours(progress.avgHours), "Avg time in progress")}
        ${metricCard(fmtHours(progress.maxHours), "Longest waiting")}
      </div>`;
  }

  function renderSla() {
    const host = document.getElementById("sla-panel");
    if (!host || !analytics?.sla) return;
    const s = analytics.sla;
    const o = s.open || {};
    const r = s.resolved || {};
    const onTimeRate =
      r.total != null && r.total > 0
        ? `${Math.round((r.onTime / r.total) * 100)}%`
        : "—";

    host.innerHTML = `
      <div class="metric-grid">
        ${metricCard(o.overdue ?? 0, "Overdue now", "metric-card--danger")}
        ${metricCard(o.dueSoon ?? 0, "Due within a day", "metric-card--warn")}
        ${metricCard(o.onTrack ?? 0, "On track")}
        ${metricCard(o.exempt ?? 0, "In progress — exempt")}
      </div>
      <p class="analytics-subtitle" style="margin-top:0.25rem">Resolution outcome vs the 3-business-day target</p>
      <div class="metric-grid">
        ${metricCard(r.total ? `${r.onTime}/${r.total}` : "—", "Resolved on time")}
        ${metricCard(onTimeRate, "On-time rate", "metric-card--good")}
        ${metricCard(r.late ?? 0, "Resolved late")}
        ${
          r.avgLateBusinessDays != null
            ? metricCard(`+${r.avgLateBusinessDays.toFixed(1)}d`, "Avg days over target")
            : metricCard("—", "Avg days over target")
        }
      </div>`;
  }

  async function refreshAnalytics() {
    try {
      const res = await Api.apiFetch("/api/analytics");
      if (!res.ok) return;
      analytics = await res.json();
      rerender();
    } catch {}
  }

  Auth.onAuthChange(({ profile, ready }) => {
    if (!ready) return;
    if (!profile) {
      window.location.href = "/login.html";
      return;
    }

    breakdown = Permissions.canViewAllTickets(profile.role);
    officerFilter = "all";

    document.getElementById("user-name").textContent = profile.displayName;
    document.getElementById("user-role").textContent =
      C.ROLE_LABELS[profile.role];
    document.getElementById("logout-btn").onclick = () => Auth.logout();

    const heading = document.getElementById("stats-heading");
    heading.textContent = breakdown ? "Team stats" : "My stats";

    setupRangeControls();

    FormConfigApi.fetchFormConfig()
      .then((cfg) => {
        formConfig = cfg;
        rerender();
      })
      .catch(() => {});

    refreshAnalytics();
    setInterval(refreshAnalytics, 30000);

    if (unsubscribe) unsubscribe();
    unsubscribe = Tickets.subscribeToTickets(
      (list) => {
        tickets = list;
        rerender();
      },
      (err) => {
        const errorEl = document.getElementById("stats-error");
        errorEl.textContent = err.message || "Could not load tickets";
        errorEl.classList.remove("hidden");
      }
    );
  });

  Auth.initAuth();
})();
