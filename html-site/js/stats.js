(function () {
  const C = window.APP_CONSTANTS;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const STATUS_CHART_META = [
    { key: "open", label: C.STATUS_LABELS.open, color: "#2563eb", countKey: "open" },
    {
      key: "in_progress",
      label: C.STATUS_LABELS.in_progress,
      color: "#d97706",
      countKey: "inProgress",
    },
    {
      key: "resolved",
      label: C.STATUS_LABELS.resolved,
      color: "#16a34a",
      countKey: "resolved",
    },
  ];

  function collectOfficerSources(tickets) {
    const known = new Set(C.COMPLIANCE_OFFICERS.map((o) => o.value));
    const extras = [
      ...new Set(
        tickets.map((t) => t.complianceOfficer).filter((v) => v && !known.has(v))
      ),
    ].sort((a, b) => a.localeCompare(b));
    return [
      ...C.COMPLIANCE_OFFICERS.map((o) => ({ value: o.value, label: o.label })),
      ...extras.map((v) => ({ value: v, label: v })),
    ];
  }

  function officerLabel(value, tickets) {
    if (!value) return "—";
    const found = collectOfficerSources(tickets || []).find(
      (o) => o.value === value
    );
    return found ? found.label : value;
  }

  function computeStats(tickets) {
    const officers = collectOfficerSources(tickets).map((o) => {
      const cases = tickets.filter((t) => t.complianceOfficer === o.value);
      return {
        value: o.value,
        label: o.label,
        total: cases.length,
        open: cases.filter((t) => t.status === "open").length,
        inProgress: cases.filter((t) => t.status === "in_progress").length,
        resolved: cases.filter((t) => t.status === "resolved").length,
      };
    });
    const byStatus = { open: 0, in_progress: 0, resolved: 0 };
    for (const t of tickets) {
      if (byStatus[t.status] !== undefined) byStatus[t.status] += 1;
    }
    return { officers, byStatus, total: tickets.length };
  }

  function renderInto(host, opts) {
    if (!host) return;
    const options = opts || {};
    const tickets = options.tickets || [];
    const statusFilter = options.statusFilter || "all";
    const officerFilter = options.officerFilter || "all";
    const showBreakdown = options.showOfficerBreakdown !== false;

    const { officers, byStatus, total } = computeStats(tickets);
    const maxTotal = Math.max(1, ...officers.map((o) => o.total));
    const sorted = [...officers].sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label)
    );

    const kpis = [
      { key: "all", label: "Total cases", n: total },
      ...STATUS_CHART_META.map((s) => ({
        key: s.key,
        label: s.label,
        n: byStatus[s.key],
      })),
    ];

    let acc = 0;
    const donutStops = STATUS_CHART_META.filter((s) => byStatus[s.key] > 0).map(
      (s) => {
        const from = (acc / total) * 100;
        acc += byStatus[s.key];
        const to = (acc / total) * 100;
        return `${s.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
      }
    );
    const donutBg = donutStops.length
      ? `conic-gradient(${donutStops.join(", ")})`
      : "color-mix(in srgb, var(--foreground) 8%, var(--card))";

    const legendItems = [
      { key: "all", label: "All statuses", n: total },
      ...STATUS_CHART_META.map((s) => ({
        key: s.key,
        label: s.label,
        n: byStatus[s.key],
        color: s.color,
      })),
    ];

    const barsBlock = showBreakdown
      ? `
      <div class="stats-bars">
        ${sorted
          .map((o) => {
            const segs = STATUS_CHART_META.map((s) => {
              const n = o[s.countKey];
              return n
                ? `<span class="stats-seg stats-seg--${s.key}" style="width:${((n / o.total) * 100).toFixed(2)}%" title="${esc(s.label)}: ${n}"></span>`
                : "";
            }).join("");
            return `
            <button type="button" class="stats-bar-row${
              officerFilter === o.value ? " is-active" : ""
            }" data-stats-officer="${esc(o.value)}" title="Focus on ${esc(o.label)}">
              <span class="stats-bar-name">${esc(o.label)}</span>
              <span class="stats-bar-track"><span class="stats-bar-fill"${o.total ? ` style="width:${((o.total / maxTotal) * 100).toFixed(2)}%"` : ""}>${segs}</span></span>
              <span class="stats-bar-total">${o.total}</span>
            </button>`;
          })
          .join("")}
      </div>`
      : "";

    const tableBlock = showBreakdown
      ? `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Compliance officer</th>
          <th>Total</th>
          <th>Open</th>
          <th>In progress</th>
          <th>Resolved</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map(
            (o) => `
          <tr${officerFilter === o.value ? ' class="is-active"' : ""}>
            <td>${esc(o.label)}</td>
            <td>${o.total}</td>
            <td>${o.open}</td>
            <td>${o.inProgress}</td>
            <td>${o.resolved}</td>
          </tr>`
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td>All officers</td>
          <td>${total}</td>
          <td>${byStatus.open}</td>
          <td>${byStatus.in_progress}</td>
          <td>${byStatus.resolved}</td>
        </tr>
      </tfoot>
    </table>`
      : "";

    host.innerHTML = `
    ${options.captionId ? `<p id="${esc(options.captionId)}" class="stats-caption"></p>` : ""}
    <div class="stats-kpis">
      ${kpis
        .map(
          (k) => `
        <button type="button" class="stats-kpi${
          statusFilter === k.key || (k.key === "all" && statusFilter === "all")
            ? " is-active"
            : ""
        }" data-stats-status="${k.key}">
          <span class="stats-kpi-value">${k.n}</span>
          <span class="stats-kpi-label">${esc(k.label)}</span>
        </button>`
        )
        .join("")}
    </div>
    <div class="stats-charts">
      <div class="stats-donut-wrap">
        <div class="stats-donut" style="background:${donutBg}" aria-hidden="true">
          <div class="stats-donut-center">
            <span class="stats-donut-total">${total}</span>
            <span class="stats-donut-caption">cases</span>
          </div>
        </div>
        <div class="stats-legend">
          ${legendItems
            .map(
              (l) => `
            <button type="button" class="stats-legend-btn${
              statusFilter === l.key ? " active" : ""
            }" data-stats-status="${l.key}">
              <span class="stats-dot"${
                l.color
                  ? ` style="background:${l.color}"`
                  : ' style="background:linear-gradient(135deg, #2563eb, #16a34a)"'
              }></span>
              <span>${esc(l.label)}</span>
              <span class="stats-legend-count">${l.n}</span>
            </button>`
            )
            .join("")}
        </div>
      </div>
      ${barsBlock}
    </div>
    ${tableBlock}`;

    host.querySelectorAll("[data-stats-status]").forEach((btn) => {
      btn.onclick = () =>
        options.onStatusFilter && options.onStatusFilter(btn.dataset.statsStatus);
    });
    host.querySelectorAll("[data-stats-officer]").forEach((btn) => {
      btn.onclick = () =>
        options.onOfficerFilter &&
        options.onOfficerFilter(btn.dataset.statsOfficer);
    });
  }

  window.Stats = {
    STATUS_CHART_META,
    collectOfficerSources,
    computeStats,
    officerLabel,
    renderInto,
  };
})();
