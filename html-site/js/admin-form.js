const CORE_IDS = new Set([
  "complianceOfficer",
  "applicantName",
  "nin",
  "phoneNumber",
  "issueType",
  "issueCategory2",
  "explanation",
  "issueSolution",
  "calledDate",
  "images",
]);

let config = null;

function $(id) {
  return document.getElementById(id);
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function showPageError(message) {
  hide($("page-loading"));
  hide($("editor"));
  const err = $("page-error");
  err.textContent = message;
  show(err);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "custom_field";
}

function renderSubOptionsEditor(fieldIndex, optIndex, subOptions) {
  const rows = (subOptions || [])
    .map(
      (sub, subIndex) => `
      <div class="sub-opt-row" style="display:flex;gap:0.5rem;margin-bottom:0.35rem;margin-left:1rem">
        <input data-sub-opt-value="${fieldIndex}-${optIndex}-${subIndex}" value="${escapeHtml(sub.value)}" placeholder="Value" style="flex:1" />
        <input data-sub-opt-label="${fieldIndex}-${optIndex}-${subIndex}" value="${escapeHtml(sub.label)}" placeholder="Checkbox label" style="flex:2" />
        <button type="button" class="btn-secondary" data-remove-sub-opt="${fieldIndex}-${optIndex}-${subIndex}">×</button>
      </div>`
    )
    .join("");

  return `
    <div class="sub-options-block" style="margin:0.5rem 0 0.75rem;padding-left:0.5rem;border-left:2px solid var(--border)">
      <span class="subtitle" style="font-size:0.75rem">Checkboxes when this option is selected</span>
      <div data-sub-options-host="${fieldIndex}-${optIndex}">${rows}</div>
      <button type="button" class="btn-secondary" data-add-sub-opt="${fieldIndex}-${optIndex}" style="margin-top:0.35rem;font-size:0.75rem">+ Add checkbox</button>
    </div>
  `;
}

function renderOptionsEditor(field, fieldIndex) {
  if (field.type !== "select") return "";
  const rows = (field.options || [])
    .map(
      (opt, optIndex) => `
      <div class="option-block" style="margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border)">
        <div class="option-row" style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
          <input data-opt-value="${fieldIndex}-${optIndex}" value="${escapeHtml(opt.value)}" placeholder="Value" style="flex:1" />
          <input data-opt-label="${fieldIndex}-${optIndex}" value="${escapeHtml(opt.label)}" placeholder="Dropdown label" style="flex:2" />
          <button type="button" class="btn-secondary" data-remove-opt="${fieldIndex}-${optIndex}">×</button>
        </div>
        ${renderSubOptionsEditor(fieldIndex, optIndex, opt.subOptions)}
      </div>`
    )
    .join("");

  return `
    <label>Dropdown options</label>
    <p class="subtitle" style="margin-top:-0.25rem;margin-bottom:0.5rem;font-size:0.75rem">Add checkboxes under an option to show them when that item is selected.</p>
    <div data-options-host="${fieldIndex}">${rows}</div>
    <button type="button" class="btn-secondary" data-add-opt="${fieldIndex}" style="margin-bottom:0.75rem">+ Add dropdown option</button>
  `;
}

function renderFieldEditor(field, index) {
  const isCore = CORE_IDS.has(field.id);
  const typeLabel =
    field.type === "images"
      ? "Images"
      : field.type.charAt(0).toUpperCase() + field.type.slice(1);

  return `
    <div class="field-editor card" data-field-index="${index}" style="margin-bottom:1rem;padding:1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.75rem">
        <div>
          <strong>${escapeHtml(field.label || field.id)}</strong>
          <span class="subtitle"> · ${typeLabel} · <code>${escapeHtml(field.id)}</code></span>
        </div>
        <div style="display:flex;gap:0.25rem">
          <button type="button" class="btn-secondary" data-move-up="${index}" title="Move up">↑</button>
          <button type="button" class="btn-secondary" data-move-down="${index}" title="Move down">↓</button>
        </div>
      </div>

      <label>Label</label>
      <input data-field-label="${index}" value="${escapeHtml(field.label || "")}" />

      ${
        field.type === "text" || field.type === "tel" || field.type === "textarea"
          ? `<label>Placeholder</label><input data-field-placeholder="${index}" value="${escapeHtml(field.placeholder || "")}" />`
          : ""
      }

      ${
        field.type === "select"
          ? `
        <label>Placeholder option</label>
        <input data-field-placeholder="${index}" value="${escapeHtml(field.placeholder || "")}" />
        <label>Display as</label>
        <select data-field-display-as="${index}">
          <option value="dropdown" ${field.displayAs !== "checkboxes" ? "selected" : ""}>Dropdown (checkboxes per option)</option>
          <option value="checkboxes" ${field.displayAs === "checkboxes" ? "selected" : ""}>All options as checkbox list</option>
        </select>
        <label style="display:flex;align-items:center;gap:0.35rem;margin:0.75rem 0 0">
          <input type="checkbox" data-field-require-sub="${index}" ${field.requireSubWhenAvailable !== false ? "checked" : ""} />
          Require checkboxes when an option has them
        </label>
        ${
          field.id === "issueType" || field.id === "leavingSoon"
            ? ""
            : `<label style="display:flex;align-items:center;gap:0.35rem;margin:0.75rem 0 0">
          <input type="checkbox" data-field-allow-multiple="${index}" ${field.allowMultiple ? "checked" : ""} />
          Allow multiple selections
        </label>`
        }
      `
          : ""
      }

      ${
        field.type === "images"
          ? `
        <label>Help text</label>
        <input data-field-help="${index}" value="${escapeHtml(field.helpText || "")}" />
        <label>Number of images required</label>
        <input type="number" min="1" max="10" data-field-max-count="${index}" value="${field.maxCount || 2}" />
        <label style="display:flex;align-items:center;gap:0.35rem;margin:0.75rem 0 0">
          <input type="checkbox" data-field-allow-camera="${index}" ${field.allowCamera !== false ? "checked" : ""} />
          Allow live camera capture
        </label>
      `
          : ""
      }

      ${field.type === "textarea" ? `<label>Rows</label><input type="number" min="2" max="12" data-field-rows="${index}" value="${field.rows || 4}" />` : ""}

      ${renderOptionsEditor(field, index)}

      <div style="display:flex;gap:1rem;margin-top:0.75rem;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:0.35rem;margin:0">
          <input type="checkbox" data-field-required="${index}" ${field.required ? "checked" : ""} /> Required
        </label>
        <label style="display:flex;align-items:center;gap:0.35rem;margin:0">
          <input type="checkbox" data-field-enabled="${index}" ${field.enabled !== false ? "checked" : ""} /> Enabled
        </label>
        ${
          !isCore
            ? `<button type="button" class="btn-danger" data-remove-field="${index}" style="margin-left:auto">Remove field</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderEditor() {
  if (!config || !Array.isArray(config.fields)) {
    showPageError("Invalid form configuration loaded.");
    return;
  }

  config.fields = config.fields
    .map((f, i) => ({ ...f, order: i }))
    .sort((a, b) => a.order - b.order);

  $("form-title").value = config.title || "";
  $("submit-label").value = config.submitLabel || "";
  $("field-list").innerHTML = config.fields
    .map((field, index) => renderFieldEditor(field, index))
    .join("");

  bindFieldEvents();
}

function readFieldFromDom(index) {
  const field = { ...config.fields[index] };
  field.label = document.querySelector(`[data-field-label="${index}"]`)?.value || "";
  field.required = document.querySelector(`[data-field-required="${index}"]`)?.checked || false;
  field.enabled = document.querySelector(`[data-field-enabled="${index}"]`)?.checked !== false;

  const placeholder = document.querySelector(`[data-field-placeholder="${index}"]`);
  if (placeholder) field.placeholder = placeholder.value;

  const displayAs = document.querySelector(`[data-field-display-as="${index}"]`);
  if (displayAs) field.displayAs = displayAs.value;

  const allowMultiple = document.querySelector(`[data-field-allow-multiple="${index}"]`);
  if (allowMultiple) field.allowMultiple = allowMultiple.checked;

  const requireSub = document.querySelector(`[data-field-require-sub="${index}"]`);
  if (requireSub) field.requireSubWhenAvailable = requireSub.checked;

  const help = document.querySelector(`[data-field-help="${index}"]`);
  if (help) field.helpText = help.value;

  const maxCount = document.querySelector(`[data-field-max-count="${index}"]`);
  if (maxCount) field.maxCount = parseInt(maxCount.value || "2", 10);

  const allowCamera = document.querySelector(`[data-field-allow-camera="${index}"]`);
  if (allowCamera) field.allowCamera = allowCamera.checked;

  const rows = document.querySelector(`[data-field-rows="${index}"]`);
  if (rows) field.rows = parseInt(rows.value || "4", 10);

  if (field.type === "select") {
    field.options = [];
    const host = document.querySelector(`[data-options-host="${index}"]`);
    if (host) {
      host.querySelectorAll(".option-block").forEach((block, optIndex) => {
        const value = document.querySelector(`[data-opt-value="${index}-${optIndex}"]`)?.value?.trim();
        const label = document.querySelector(`[data-opt-label="${index}-${optIndex}"]`)?.value?.trim();
        if (!value || !label) return;

        const subOptions = [];
        const subHost = document.querySelector(`[data-sub-options-host="${index}-${optIndex}"]`);
        if (subHost) {
          subHost.querySelectorAll(".sub-opt-row").forEach((row, subIndex) => {
            const subValue = document
              .querySelector(`[data-sub-opt-value="${index}-${optIndex}-${subIndex}"]`)
              ?.value?.trim();
            const subLabel = document
              .querySelector(`[data-sub-opt-label="${index}-${optIndex}-${subIndex}"]`)
              ?.value?.trim();
            if (subValue && subLabel) subOptions.push({ value: subValue, label: subLabel });
          });
        }

        field.options.push({ value, label, subOptions });
      });
    }
  }

  return field;
}

function readConfigFromDom() {
  return {
    title: $("form-title").value.trim() || "Raise New Issue",
    submitLabel: $("submit-label").value.trim() || "Submit Ticket",
    fields: config.fields.map((_, index) => readFieldFromDom(index)),
  };
}

function bindFieldEvents() {
  document.querySelectorAll("[data-move-up]").forEach((btn) => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.moveUp, 10);
      if (i <= 0) return;
      config = readConfigFromDom();
      [config.fields[i - 1], config.fields[i]] = [config.fields[i], config.fields[i - 1]];
      renderEditor();
    };
  });

  document.querySelectorAll("[data-move-down]").forEach((btn) => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.moveDown, 10);
      config = readConfigFromDom();
      if (i >= config.fields.length - 1) return;
      [config.fields[i + 1], config.fields[i]] = [config.fields[i], config.fields[i + 1]];
      renderEditor();
    };
  });

  document.querySelectorAll("[data-remove-field]").forEach((btn) => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.removeField, 10);
      if (!confirm("Remove this field?")) return;
      config = readConfigFromDom();
      config.fields.splice(i, 1);
      renderEditor();
    };
  });

  document.querySelectorAll("[data-add-opt]").forEach((btn) => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.addOpt, 10);
      config = readConfigFromDom();
      const field = config.fields[i];
      field.options = field.options || [];
      field.options.push({ value: `option_${field.options.length + 1}`, label: "New option" });
      renderEditor();
    };
  });

  document.querySelectorAll("[data-remove-opt]").forEach((btn) => {
    btn.onclick = () => {
      const [fieldIndex, optIndex] = btn.dataset.removeOpt.split("-").map(Number);
      config = readConfigFromDom();
      config.fields[fieldIndex].options.splice(optIndex, 1);
      renderEditor();
    };
  });

  document.querySelectorAll("[data-add-sub-opt]").forEach((btn) => {
    btn.onclick = () => {
      const [fieldIndex, optIndex] = btn.dataset.addSubOpt.split("-").map(Number);
      config = readConfigFromDom();
      const opt = config.fields[fieldIndex].options[optIndex];
      opt.subOptions = opt.subOptions || [];
      opt.subOptions.push({
        value: `sub_${opt.subOptions.length + 1}`,
        label: "New checkbox",
      });
      renderEditor();
    };
  });

  document.querySelectorAll("[data-remove-sub-opt]").forEach((btn) => {
    btn.onclick = () => {
      const parts = btn.dataset.removeSubOpt.split("-").map(Number);
      const fieldIndex = parts[0];
      const optIndex = parts[1];
      const subIndex = parts[2];
      config = readConfigFromDom();
      config.fields[fieldIndex].options[optIndex].subOptions.splice(subIndex, 1);
      renderEditor();
    };
  });
}

function addCustomField(type) {
  config = readConfigFromDom();
  const label = type === "select" ? "New dropdown" : "New field";
  let id = slugify(label);
  let n = 1;
  while (config.fields.some((f) => f.id === id)) {
    id = `${slugify(label)}_${n++}`;
  }

  const field = {
    id,
    type,
    label,
    placeholder: type === "select" ? "Select..." : "",
    required: false,
    enabled: true,
    order: config.fields.length,
  };

  if (type === "select") {
    field.options = [{ value: "option_1", label: "Option 1", subOptions: [] }];
    field.displayAs = "dropdown";
    field.allowMultiple = false;
    field.requireSubWhenAvailable = true;
  }

  config.fields.push(field);
  renderEditor();
}

async function loadEditor() {
  if (typeof FormConfigApi === "undefined") {
    throw new Error("Form config script failed to load. Hard-refresh the page.");
  }
  config = await FormConfigApi.fetchFormConfig();
  renderEditor();
  hide($("page-loading"));
  hide($("page-error"));
  show($("editor"));
}

function bindChrome() {
  $("logout-btn").onclick = () => Auth.logout();
  $("add-text-field").onclick = () => addCustomField("text");
  $("add-textarea-field").onclick = () => addCustomField("textarea");
  $("add-select-field").onclick = () => addCustomField("select");

  $("save-btn").onclick = async () => {
    const err = $("save-error");
    const ok = $("save-success");
    hide(err);
    hide(ok);
    $("save-btn").disabled = true;

    try {
      const payload = readConfigFromDom();
      config = await FormConfigApi.saveFormConfig(payload);
      renderEditor();
      ok.textContent = "Form saved. New tickets will use these settings.";
      show(ok);
    } catch (e) {
      err.textContent = e.message;
      show(err);
    } finally {
      $("save-btn").disabled = false;
    }
  };

  $("reset-btn").onclick = async () => {
    if (!confirm("Reset form to default settings? This cannot be undone.")) return;
    $("save-btn").disabled = true;
    try {
      const res = await Api.apiFetch("/api/form-config/defaults");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load defaults");
      config = await FormConfigApi.saveFormConfig(data.config);
      renderEditor();
      $("save-success").textContent = "Form reset to defaults.";
      show($("save-success"));
    } catch (e) {
      $("save-error").textContent = e.message;
      show($("save-error"));
    } finally {
      $("save-btn").disabled = false;
    }
  };
}

function init() {
  if (typeof Auth === "undefined") {
    showPageError("Auth script failed to load. Make sure you open this page via npm run dev.");
    return;
  }

  bindChrome();

  Auth.onAuthChange(async ({ profile, ready }) => {
    if (!ready) return;

    if (!profile) {
      window.location.href = "/login.html";
      return;
    }

    if (profile.role !== "admin") {
      hide($("page-loading"));
      show($("access-denied"));
      return;
    }

    try {
      await loadEditor();
    } catch (e) {
      showPageError(
        e.message +
          " — Try restarting the server with npm run dev, then hard-refresh (Ctrl+Shift+R)."
      );
    }
  });

  Auth.initAuth();
}

init();
