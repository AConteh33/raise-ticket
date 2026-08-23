const C = window.APP_CONSTANTS;
let formConfig = null;
let imageState = { images: [], previewUrls: [], resetImages: () => {} };

async function mountTicketImage(wrap, img, sourceUrl) {
  wrap.classList.add("ticket-image-item--loading");
  try {
    const blobUrl = await Api.loadImageBlobUrl(sourceUrl);
    img.src = blobUrl;
    wrap.href = blobUrl;
    wrap.classList.remove("ticket-image-item--loading");
  } catch {
    wrap.classList.remove("ticket-image-item--loading");
    wrap.classList.add("ticket-image-item--error");
    img.remove();
    wrap.appendChild(document.createTextNode("Image unavailable"));
    wrap.removeAttribute("href");
    wrap.removeAttribute("target");
  }
}
let statusFilter = "all";
let officerFilter = "all";
let searchQuery = "";
let allTickets = [];
let unsubscribeTickets = null;
let activityUnsubscribes = [];
let lastRenderedKey = "";
let officerBreakdownEnabled = true;

function $(id) {
  return document.getElementById(id);
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function labelFor(fieldId, fallback) {
  const field = (formConfig?.fields || []).find((f) => f.id === fieldId);
  return field?.label || fallback;
}

function issueLabel(value) {
  if (formConfig) return FormBuilder.resolveOptionLabel(formConfig, "issueType", value);
  return C.ISSUE_TYPE_LABELS[value] || value;
}

function officerLabel(value) {
  if (!value) return "—";
  if (formConfig) return FormBuilder.resolveOptionLabel(formConfig, "complianceOfficer", value);
  const found = C.COMPLIANCE_OFFICERS.find((o) => o.value === value);
  return found?.label || value;
}

function formatTicketNumber(num) {
  if (num == null) return "";
  return `#${num}`;
}

function ticketMatchesSearch(ticket, query) {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const normalized = trimmed.toLowerCase().replace(/^#/, "");
  if (normalized && String(ticket.ticketNumber ?? "").includes(normalized)) {
    return true;
  }

  const applicant = (ticket.applicantName || "").toLowerCase();
  if (applicant.includes(trimmed.toLowerCase())) return true;

  const phone = (ticket.phoneNumber || "").replace(/\s/g, "");
  if (phone && phone.includes(trimmed.replace(/\s/g, ""))) return true;

  const nin = (ticket.nin || "").toLowerCase();
  if (nin && nin.includes(trimmed.toLowerCase())) return true;

  return false;
}

function getFilteredTickets() {
  return allTickets
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) => officerFilter === "all" || t.complianceOfficer === officerFilter)
    .filter((t) => ticketMatchesSearch(t, searchQuery));
}

function ticketRenderToken(ticket) {
  const updated =
    ticket.updatedAt instanceof Date
      ? ticket.updatedAt.getTime()
      : new Date(ticket.updatedAt).getTime();
  return `${ticket.id}:${updated}:${ticket.status}:${ticket.ticketNumber ?? ""}`;
}

function currentRenderKey() {
  return `${statusFilter}\0${officerFilter}\0${searchQuery}\0${getFilteredTickets()
    .map(ticketRenderToken)
    .join("|")}`;
}

function scheduleRenderTickets(force = false) {
  const key = currentRenderKey();
  if (!force && key === lastRenderedKey) return;
  lastRenderedKey = key;
  void renderTickets();
}

function updateEmptyState(hasTickets, hasMatches) {
  const title = $("empty-state").querySelector(".empty-title");
  const text = $("empty-state").querySelector(".empty-text");

  if (!hasTickets) {
    title.textContent = "No tickets yet";
    text.textContent = "Tickets matching this filter will appear here.";
    return;
  }

  if (!hasMatches) {
    title.textContent = "No matching tickets";
    text.textContent = searchQuery.trim()
      ? `Nothing found for "${searchQuery.trim()}". Try a ticket number (e.g. #12) or applicant name.`
      : "No tickets match the current status filter.";
    return;
  }

  title.textContent = "No tickets yet";
  text.textContent = "Tickets matching this filter will appear here.";
}

function renderStats() {
  const host = $("stats-table");
  if (!host || !window.Stats) return;

  if (!officerBreakdownEnabled) {
    officerFilter = "all";
    renderOfficerFilters();
  }

  const scoped = allTickets.filter((t) => ticketMatchesSearch(t, searchQuery));
  Stats.renderInto(host, {
    tickets: scoped,
    statusFilter,
    officerFilter,
    showOfficerBreakdown: officerBreakdownEnabled,
    onStatusFilter: applyStatusFilter,
    onOfficerFilter: applyOfficerFilter,
  });
}

function applyStatusFilter(key) {
  statusFilter = key === statusFilter && key !== "all" ? "all" : key;
  renderFilters();
  renderStats();
  scheduleRenderTickets(true);
}

function applyOfficerFilter(key) {
  officerFilter = key === officerFilter ? "all" : key;
  renderOfficerFilters();
  renderStats();
  scheduleRenderTickets(true);
}

function renderOfficerFilters() {
  const host = $("officer-filters");
  if (!host) return;
  host.innerHTML = "";
  if (!officerBreakdownEnabled) return;

  const items = [
    { key: "all", label: `All officers (${allTickets.length})` },
    ...collectOfficerSources(allTickets).map((o) => ({
      key: o.value,
      label: `${o.label} (${allTickets.filter((t) => t.complianceOfficer === o.value).length})`,
    })),
  ];

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn${officerFilter === item.key ? " active" : ""}`;
    btn.textContent = item.label;
    btn.onclick = () => {
      officerFilter = item.key;
      renderOfficerFilters();
      renderStats();
      scheduleRenderTickets(true);
    };
    host.appendChild(btn);
  }
}

function renderFilters() {
  const filters = $("filters");
  filters.innerHTML = "";

  const items = [
    { key: "all", label: `All (${allTickets.length})` },
    ...C.TICKET_STATUSES.map((s) => ({
      key: s,
      label: `${C.STATUS_LABELS[s]} (${allTickets.filter((t) => t.status === s).length})`,
    })),
  ];

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn${statusFilter === item.key ? " active" : ""}`;
    btn.textContent = item.label;
    btn.onclick = () => {
      statusFilter = item.key;
      renderFilters();
      renderStats();
      scheduleRenderTickets(true);
    };
    filters.appendChild(btn);
  }
}

function formatActivityTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function paintActivityLog(box, state) {
  const itemsEl = box.querySelector(".activity-items");
  const countEl = box.querySelector(".activity-count");
  const { logs, loading, error } = state;

  if (loading) {
    countEl.textContent = "";
    itemsEl.innerHTML = '<p class="activity-placeholder">Loading activityâ€¦</p>';
    return;
  }

  if (error) {
    countEl.textContent = "";
    itemsEl.innerHTML = `<p class="activity-placeholder activity-placeholder--error">${FormBuilder.escapeHtml(error)}</p>`;
    return;
  }

  countEl.textContent = `(${logs.length})`;
  if (!logs.length) {
    itemsEl.innerHTML = '<p class="activity-placeholder">No activity recorded yet.</p>';
    return;
  }

    itemsEl.innerHTML = logs
    .map((log) => {
      let detail = C.ACTIVITY_ACTION_LABELS[log.action] || log.action;
      if (log.action === "status_changed" && log.fromStatus && log.toStatus) {
        detail += `: ${C.STATUS_LABELS[log.fromStatus]} â†’ ${C.STATUS_LABELS[log.toStatus]}`;
      }
      if (log.action === "escalation_changed" && log.toStatus) {
        detail += `: ${log.toStatus}`;
      }
      return `<div class="activity-item"><span class="activity-action">${detail}</span><span class="activity-meta">${FormBuilder.escapeHtml(log.performedByName)} Â· ${FormBuilder.escapeHtml(C.ROLE_LABELS[log.performedByRole] || log.performedByRole)} Â· ${formatActivityTime(log.createdAt)}</span></div>`;
    })
    .join("");
}

function renderActivity(container, ticketId) {
  const body = container.querySelector(".ticket-body") || container;
  const box = document.createElement("details");
  box.className = "activity-log";
  box.innerHTML =
    '<summary class="activity-summary">Activity <span class="activity-count"></span></summary><div class="activity-items"></div>';
  body.appendChild(box);

  const unsub = Activity.subscribeToTicketActivity(ticketId, (state) => {
    if (!box.isConnected) return;
    paintActivityLog(box, state);
  });
  activityUnsubscribes.push(unsub);
}

function paintComments(box, state, pending) {
  const itemsEl = box.querySelector(".comments-items");
  const countEl = box.querySelector(".comments-count");
  const { comments, loading, error } = state;

  if (loading && !comments.length && !pending.length) {
    countEl.textContent = "";
    itemsEl.innerHTML = '<p class="activity-placeholder">Loading commentsâ€¦</p>';
    return;
  }

  if (error) {
    countEl.textContent = "";
    itemsEl.innerHTML = `<p class="activity-placeholder activity-placeholder--error">${FormBuilder.escapeHtml(error)}</p>`;
    return;
  }

  const pendingIds = new Set(comments.map((c) => c.id));
  const merged = [...comments, ...pending.filter((c) => !pendingIds.has(c.id))];

  countEl.textContent = `(${merged.length})`;
  if (!merged.length) {
    itemsEl.innerHTML = '<p class="activity-placeholder">No comments yet.</p>';
    return;
  }

  itemsEl.innerHTML = merged
    .map(
      (c) =>
        `<div class="comment-item"><p class="comment-body">${FormBuilder.escapeHtml(c.body)}</p><span class="activity-meta">${FormBuilder.escapeHtml(c.authorName)} Â· ${FormBuilder.escapeHtml(C.ROLE_LABELS[c.authorRole] || c.authorRole)} Â· ${formatActivityTime(c.createdAt)}</span></div>`
    )
    .join("");
}

function renderComments(card, ticket) {
  const profile = Auth.getCurrentProfile();
  const canPost = Permissions.canCommentTicket(
    profile.role,
    ticket.createdByUid,
    Auth.getCurrentUser().uid
  );
  const body = card.querySelector(".ticket-body") || card;
  const box = document.createElement("details");
  box.className = "comments-log";
  box.innerHTML =
    '<summary class="comments-summary">Comments <span class="comments-count"></span></summary><div class="comments-items"></div>' +
    (canPost
      ? '<div class="comments-composer"><textarea class="comments-input" rows="2" maxlength="2000" placeholder="Add a commentâ€¦"></textarea><div class="comments-composer-actions"><span class="comments-error" role="alert"></span><button type="button" class="btn-secondary comments-post">Comment</button></div></div>'
      : "");
  body.appendChild(box);

  const pending = [];
  const repaint = (state) => paintComments(box, state, pending);

  if (canPost) {
    const input = box.querySelector(".comments-input");
    const postBtn = box.querySelector(".comments-post");
    const errorEl = box.querySelector(".comments-error");
    postBtn.onclick = async () => {
      const text = input.value.trim();
      if (!text) {
        errorEl.textContent = "Write something first.";
        return;
      }
      postBtn.disabled = true;
      input.disabled = true;
      try {
        const comment = await Comments.addComment(ticket.id, text);
        input.value = "";
        errorEl.textContent = "";
        pending.push(comment);
        repaint({ comments: latestState.comments, loading: false, error: null });
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        postBtn.disabled = false;
        input.disabled = false;
      }
    };
  }

  let latestState = { comments: [], loading: true, error: null };
  const unsub = Comments.subscribeToTicketComments(ticket.id, (state) => {
    if (!box.isConnected) return;
    latestState = state;
    repaint(state);
  });
  activityUnsubscribes.push(unsub);
}

async function renderTickets() {
  for (const unsub of activityUnsubscribes) unsub();
  activityUnsubscribes = [];

  const list = $("ticket-list");
  const empty = $("empty-state");
  list.innerHTML = "";

  const profile = Auth.getCurrentProfile();
  const filtered = getFilteredTickets();

  if (!allTickets.length) {
    show(empty);
    updateEmptyState(false, false);
    return;
  }

  if (!filtered.length) {
    show(empty);
    updateEmptyState(true, false);
    return;
  }

  hide(empty);
  updateEmptyState(true, true);

  const activeImagePaths = new Set();

  for (const ticket of filtered) {
    const card = document.createElement("article");
    card.className = `card ticket-card ticket-card--${ticket.status}`;
    if (ticket.ticketNumber != null) {
      card.dataset.ticketNumber = String(ticket.ticketNumber);
    }

    const editable = Permissions.canEditTicket(
      profile.role,
      ticket.createdByUid,
      Auth.getCurrentUser().uid
    );
    const canDelete = Permissions.canDeleteTicket(profile.role);

    const applicantName = ticket.applicantName || "Unknown";
    const categoryLabel =
      ticket.issueType && ticket.issueType !== "unspecified"
        ? issueLabel(ticket.issueType)
        : "";
    const category2 = ticket.issueCategory2 || ticket.formData?.issueCategory2 || "";
    const calledDate = ticket.calledDate || ticket.formData?.calledDate || "";
    const esc = FormBuilder.escapeHtml;

    card.innerHTML = `
      <div class="ticket-head">
        <div class="ticket-identity">
          <div class="ticket-head-text">
            ${
              ticket.ticketNumber != null
                ? `<p class="ticket-number">${esc(formatTicketNumber(ticket.ticketNumber))}</p>`
                : ""
            }
            <h3 class="ticket-title">${esc(applicantName)}</h3>
            ${
              categoryLabel || category2
                ? `<div class="ticket-cat-row">
                    ${categoryLabel ? `<span class="ticket-chip ticket-chip--category">${esc(categoryLabel)}</span>` : ""}
                    ${category2 ? `<span class="ticket-chip">${esc(category2)}</span>` : ""}
                  </div>`
                : ""
            }
          </div>
        </div>
        <div class="ticket-status-slot">
          ${renderSlaBadge(ticket)}
          <span data-status-slot></span>
        </div>
      </div>
      <div class="ticket-body">
        <div class="ticket-meta">
          <span class="ticket-chip"><span class="ticket-chip-key">Officer</span>${esc(officerLabel(ticket.complianceOfficer))}</span>
          <span class="ticket-chip"><span class="ticket-chip-key">NIN</span>${esc(ticket.nin || "—")}</span>
          ${
            ticket.phoneNumber
              ? `<a class="ticket-chip ticket-chip--link" href="tel:${ticket.phoneNumber.replace(/\s/g, "")}"><span class="ticket-chip-key">Contact</span>${esc(ticket.phoneNumber)}</a>`
              : ""
          }
          ${calledDate ? `<span class="ticket-chip"><span class="ticket-chip-key">Called</span>${esc(calledDate)}</span>` : ""}
        </div>
        <section class="ticket-section ticket-section--issue">
          <h4 class="ticket-section-label">Issue explained</h4>
          <p>${esc(ticket.explanation || "—")}</p>
        </section>
        <section class="ticket-section ticket-section--solution">
          <h4 class="ticket-section-label">Resolution / next steps</h4>
          <div data-solution-slot></div>
        </section>
        <div class="ticket-escalation-row">
          <h4 class="ticket-section-label">Escalated to</h4>
          <span class="ticket-escalation-value" data-escalation></span>
        </div>
        <div class="ticket-images" data-images></div>
      </div>
      <footer class="ticket-footer"></footer>
    `;

    const statusSlot = card.querySelector("[data-status-slot]");
    if (editable) {
      const select = document.createElement("select");
      select.className = "ticket-status-select";
      select.setAttribute("aria-label", "Ticket status");
      for (const s of C.TICKET_STATUSES) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = C.STATUS_LABELS[s];
        if (s === ticket.status) opt.selected = true;
        select.appendChild(opt);
      }
      select.onchange = async () => {
        select.disabled = true;
        try {
          await Tickets.updateTicket(ticket.id, { status: select.value });
        } catch (err) {
          alert(err.message);
          select.value = ticket.status;
        } finally {
          select.disabled = false;
        }
      };
      statusSlot.appendChild(select);
    } else {
      statusSlot.innerHTML = `<span class="badge badge-${ticket.status}"><span class="badge-dot" aria-hidden="true"></span>${C.STATUS_LABELS[ticket.status]}</span>`;
    }

    const imagesEl = card.querySelector("[data-images]");
    if (ticket.imageUrls.length) {
      for (const url of ticket.imageUrls) {
        activeImagePaths.add(Api.toImagePath(url));
        const wrap = document.createElement("a");
        wrap.className = "ticket-image-item";
        wrap.target = "_blank";
        wrap.rel = "noopener noreferrer";
        const img = document.createElement("img");
        img.alt = "Ticket attachment";
        wrap.appendChild(img);
        imagesEl.appendChild(wrap);
        mountTicketImage(wrap, img, url);
      }
    } else {
      imagesEl.remove();
    }

    const solutionSlot = card.querySelector("[data-solution-slot]");
    if (editable) {
      const solutionInput = document.createElement("textarea");
      solutionInput.className = "ticket-solution-input";
      solutionInput.rows = 3;
      solutionInput.value = ticket.issueSolution || "";
      solutionInput.placeholder = "What was done / next stepsâ€¦";
      let saveTimer;
      solutionInput.oninput = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          try {
            await Tickets.updateTicket(ticket.id, { issueSolution: solutionInput.value });
          } catch (err) {
            alert(err.message);
          }
        }, 600);
      };
      solutionSlot.appendChild(solutionInput);
    } else {
      const p = document.createElement("p");
      p.textContent = ticket.issueSolution || "—";
      solutionSlot.appendChild(p);
    }

    const escalationEl = card.querySelector("[data-escalation]");
    let escalatedTo = Array.isArray(ticket.escalatedTo) ? ticket.escalatedTo : [];
    if (editable && ticket.status === "in_progress") {
      escalationEl.classList.add("escalation-chips");
      for (const contact of C.ESCALATION_CONTACTS) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `escalation-chip${escalatedTo.includes(contact.value) ? " active" : ""}`;
        chip.textContent = contact.label;
        chip.onclick = async () => {
          const next = escalatedTo.includes(contact.value)
            ? escalatedTo.filter((v) => v !== contact.value)
            : [...escalatedTo, contact.value];
          chip.disabled = true;
          try {
            await Tickets.updateTicket(ticket.id, { escalatedTo: next });
            escalatedTo = next;
            chip.classList.toggle("active", next.includes(contact.value));
          } catch (err) {
            alert(err.message);
          } finally {
            chip.disabled = false;
          }
        };
        escalationEl.appendChild(chip);
      }
    } else {
      escalationEl.textContent = escalatedTo.length
        ? escalatedTo
            .map((v) => C.ESCALATION_CONTACTS.find((c) => c.value === v)?.label || v)
            .join(", ")
        : "—";
    }

    renderActivity(card, ticket.id);
    renderComments(card, ticket);

    const actions = card.querySelector(".ticket-footer");

    if (canDelete) {
      const actionGroup = document.createElement("div");
      actionGroup.className = "ticket-actions";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-danger";
      del.textContent = "Delete ticket";
      del.onclick = async () => {
        if (!confirm("Delete this ticket?")) return;
        del.disabled = true;
        try {
          await Tickets.deleteTicket(ticket.id);
        } catch (err) {
          alert(err.message);
          del.disabled = false;
        }
      };
      actionGroup.appendChild(del);
      actions.appendChild(actionGroup);
    } else {
      actions.remove();
    }

    list.appendChild(card);
  }

  Api.pruneImageCache(activeImagePaths);
}

function setupForm() {
  const form = $("ticket-form");
  FormBuilder.renderTicketForm(form, formConfig);
  imageState = { images: [], previewUrls: [] };
  FormBuilder.setupImagePicker(form, imageState);

  const duplicateWarning = document.createElement("div");
  duplicateWarning.className = "alert alert-error hidden";
  duplicateWarning.id = "duplicate-warning";
  form.insertBefore(duplicateWarning, form.querySelector("[data-form-fields]"));

  function checkDuplicateLive() {
    const nameField = form.querySelector('[data-field-id="applicantName"]');
    const ninField = form.querySelector('[data-field-id="nin"]');
    const name = nameField ? nameField.value.trim() : "";
    const nin = ninField ? ninField.value.trim() : "";

    if (!name && !nin) {
      hide(duplicateWarning);
      return;
    }

    const match = Tickets.checkDuplicateClient(name, nin, null, allTickets);
    if (match) {
      duplicateWarning.textContent = `A case for this client is already open (ticket #${match.ticketNumber || "?"}). It must be resolved before creating a new one.`;
      show(duplicateWarning);
    } else {
      hide(duplicateWarning);
    }
  }

  let liveTimer = null;
  form.addEventListener("input", () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(checkDuplicateLive, 350);
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errorEl = $("form-error");
    hide(errorEl);

    const imageError = FormBuilder.validateImages(form, formConfig);
    if (imageError) {
      errorEl.textContent = imageError;
      show(errorEl);
      return;
    }

    const values = FormBuilder.collectValues(form, formConfig);
    const dupMatch = Tickets.checkDuplicateClient(
      values.applicantName || "",
      values.nin || "",
      null,
      allTickets
    );
    if (dupMatch) {
      errorEl.textContent = `A case for this client is already open (ticket #${dupMatch.ticketNumber || "?"}). It must be resolved before creating a new one.`;
      show(errorEl);
      return;
    }

    const btn = form.querySelector("[data-submit-btn]");
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Submitting...";

    try {
      await Tickets.createTicket(values, imageState.images);
      form.reset();
      imageState.resetImages();
      hide(duplicateWarning);
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };
}

function renderSlaBadge(ticket) {
  if (!window.SLA) return "";
  const state = SLA.slaState(ticket);
  if (state === "overdue") {
    const days = SLA.businessDaysOverdue(ticket);
    return `<span class="sla-badge sla-badge--overdue" title="Past the 3-business-day target">Overdue${days > 1 ? ` +${days - 1}d` : ""}</span>`;
  }
  if (state === "due_soon") {
    return `<span class="sla-badge sla-badge--due" title="Due within one business day">Due soon</span>`;
  }
  return "";
}

function setupDataTools() {
  const panel = $("data-tools");
  if (!panel) return;

  const exportBtn = $("excel-export-btn");
  if (exportBtn) exportBtn.href = Api.apiUrl("/api/admin/excel/export");

  const statusEl = $("excel-status");
  const input = $("excel-import-input");
  if (!input || !statusEl) return;

  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;

    const mode =
      document.querySelector('input[name="excel-import-mode"]:checked')
        ?.value || "merge";
    if (
      mode === "replace" &&
      !window.confirm(
        "Replace ALL existing tickets with the contents of this workbook? This cannot be undone."
      )
    ) {
      return;
    }

    statusEl.className = "excel-status";
    statusEl.textContent = "Importingâ€¦";
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await Api.apiFetch("/api/admin/excel/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
      statusEl.className = "excel-status is-ok";
      statusEl.textContent = `Imported ${data.imported} ticket(s)${
        data.replaced ? " — previous tickets replaced" : ""
      }. Reloadingâ€¦`;
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      statusEl.className = "excel-status is-error";
      statusEl.textContent = err.message;
    }
  };
}

function setupDashboard(profile) {
  officerBreakdownEnabled = Permissions.canViewAllTickets(profile.role);

  $("user-name").textContent = profile.displayName;
  $("user-role").textContent = C.ROLE_LABELS[profile.role];
  $("logout-btn").onclick = () => Auth.logout();

  const statsLink = $("stats-link");
  if (statsLink) {
    statsLink.textContent = officerBreakdownEnabled ? "Team stats" : "My stats";
    show(statsLink);
  }

  if (profile.role === "admin") {
    show($("data-tools"));
    setupDataTools();
  }

  if (profile.role === "admin") {
    show($("admin-link"));
    show($("admin-form-link"));
  }
  if (Permissions.canCreateTickets(profile.role)) show($("form-aside"));
  else $("tickets-section").classList.add("grid-full");

  if (profile.role === "analysts") {
    show($("analyst-banner"));
    $("tickets-heading").textContent = "All Tickets";
  }

  const searchInput = $("ticket-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderStats();
      scheduleRenderTickets(true);
    });
  }

  FormConfigApi.fetchFormConfig()
    .then((cfg) => {
      formConfig = cfg;
      setupForm();
    })
    .catch(() => {
      formConfig = null;
      setupForm();
    });

  if (unsubscribeTickets) unsubscribeTickets();
  unsubscribeTickets = Tickets.subscribeToTickets(
    (tickets) => {
      allTickets = tickets;
      renderStats();
      renderOfficerFilters();
      renderFilters();
      scheduleRenderTickets();
    },
    (err) => {
      const title = $("empty-state").querySelector(".empty-title");
      const text = $("empty-state").querySelector(".empty-text");
      if (title) title.textContent = "Could not load tickets";
      if (text) text.textContent = err.message;
      show($("empty-state"));
    }
  );
}

async function init() {
  Auth.onAuthChange(({ profile, ready }) => {
    if (!ready) return;
    if (!profile) {
      window.location.href = "/login.html";
      return;
    }
    show($("dashboard"));
    setupDashboard(profile);
  });

  Auth.initAuth();
}

init();
