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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function parseSelectValue(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* single value */
  }
  return [String(raw)];
}

function getFieldOption(config, fieldId, value) {
  const field = (config.fields || []).find((f) => f.id === fieldId);
  return (field?.options || []).find((o) => o.value === value);
}

function formatSubOptionDisplay(config, fieldId, mainValue, subRaw) {
  const opt = getFieldOption(config, fieldId, mainValue);
  if (!opt?.subOptions?.length) return "";
  const selected = parseSelectValue(subRaw);
  if (!selected.length) return "";
  const labels = selected.map((v) => {
    const sub = opt.subOptions.find((s) => s.value === v);
    return sub?.label || v;
  });
  return labels.join(", ");
}

function formatSelectDisplay(config, fieldId, raw) {
  const values = parseSelectValue(raw);
  if (!values.length) return "";
  return values
    .map((v) => resolveOptionLabel(config, fieldId, v))
    .join(", ");
}

function getLabelMaps(config) {
  const issueTypes = {};
  const customSelects = {};

  for (const field of config.fields || []) {
    if (field.id === "issueType" && field.options) {
      for (const o of field.options) issueTypes[o.value] = o.label;
    }
    if (field.type === "select" && field.options) {
      customSelects[field.id] = Object.fromEntries(
        field.options.map((o) => [o.value, o.label])
      );
    }
  }

  return { issueTypes, customSelects };
}

function resolveOptionLabel(config, fieldId, value) {
  const maps = getLabelMaps(config);
  if (fieldId === "issueType") return maps.issueTypes[value] || value;
  if (maps.customSelects[fieldId]) return maps.customSelects[fieldId][value] || value;
  return value;
}

function getImageField(config) {
  return (config.fields || []).find((f) => f.type === "images" && f.enabled);
}

function renderSubCheckboxPanel(field, option) {
  if (!option.subOptions?.length) return "";
  const subs = option.subOptions
    .map(
      (s) => `
      <label class="checkbox-option">
        <input type="checkbox" value="${escapeHtml(s.value)}" data-sub-value="${escapeHtml(s.value)}" />
        <span>${escapeHtml(s.label)}</span>
      </label>`
    )
    .join("");

  return `
    <div class="sub-checkbox-panel hidden" data-sub-panel="${escapeHtml(field.id)}" data-for-option="${escapeHtml(option.value)}">
      <p class="subtitle sub-checkbox-title">Select details for ${escapeHtml(option.label)}</p>
      ${subs}
    </div>
  `;
}

function renderSelectDropdown(field) {
  const req = field.required ? " required" : "";
  const id = escapeHtml(field.id);
  const opts = (field.options || [])
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
    )
    .join("");

  const subPanels = (field.options || [])
    .map((o) => renderSubCheckboxPanel(field, o))
    .join("");

  const hasSubOptions = (field.options || []).some((o) => o.subOptions?.length);

  return `
    <div class="dropdown-with-sub" data-dropdown-field="${id}">
      <label for="field-${id}">${escapeHtml(field.label)}</label>
      <select id="field-${id}" name="${id}"${req} data-field-id="${id}" data-select-mode="dropdown">
        <option value="">${escapeHtml(field.placeholder || "Select...")}</option>
        ${opts}
      </select>
      ${hasSubOptions ? `<div class="sub-checkbox-host" data-sub-host="${id}">${subPanels}</div>` : ""}
      <input type="hidden" name="${id}_sub" data-sub-input="${id}" value="" />
    </div>
  `;
}

function renderSelectCheckboxes(field) {
  const id = escapeHtml(field.id);
  const multiple = field.allowMultiple === true;
  const opts = (field.options || [])
    .map(
      (o) => `
      <label class="checkbox-option">
        <input type="checkbox" name="${id}" value="${escapeHtml(o.value)}"
          data-option-value="${escapeHtml(o.value)}" />
        <span>${escapeHtml(o.label)}</span>
      </label>`
    )
    .join("");

  return `
    <div class="select-checkbox-field" data-field-id="${id}" data-allow-multiple="${multiple ? "1" : "0"}">
      <label>${escapeHtml(field.label)}</label>
      <button type="button" class="select-trigger" data-select-trigger="${id}" aria-expanded="false">
        <span data-trigger-label="${id}">${escapeHtml(field.placeholder || "Select...")}</span>
        <span class="select-chevron">▾</span>
      </button>
      <div class="checkbox-panel hidden" data-checkbox-panel="${id}">
        ${opts}
      </div>
      <input type="hidden" data-field-id="${id}" data-select-mode="checkboxes" name="${id}" value="" />
    </div>
  `;
}

function renderField(field) {
  const req = field.required ? " required" : "";
  const id = escapeHtml(field.id);

  if (field.type === "text" || field.type === "tel" || field.type === "email" || field.type === "date") {
    const inputType = field.type === "date" ? "date" : field.type;
    return `
      <label for="field-${id}">${escapeHtml(field.label)}</label>
      <input id="field-${id}" name="${id}" type="${inputType}"${req}
        placeholder="${escapeHtml(field.placeholder || "")}" data-field-id="${id}" />
    `;
  }

  if (field.type === "textarea") {
    return `
      <label for="field-${id}">${escapeHtml(field.label)}</label>
      <textarea id="field-${id}" name="${id}" rows="${field.rows || 4}"${req}
        placeholder="${escapeHtml(field.placeholder || "")}" data-field-id="${id}"></textarea>
    `;
  }

  if (field.type === "select") {
    if (field.displayAs === "checkboxes") {
      return renderSelectCheckboxes(field);
    }
    return renderSelectDropdown(field);
  }

  if (field.type === "images") {
    const max = field.maxCount || 2;
    const allowCamera = field.allowCamera !== false;
    return `
      <div class="image-field" data-image-field data-max="${max}" data-allow-camera="${allowCamera ? "1" : "0"}">
        <label> ${escapeHtml(field.label)} (<span class="image-count">0</span>/${max})</label>
        ${field.helpText ? `<p class="subtitle image-help">${escapeHtml(field.helpText)}</p>` : ""}
        <div class="image-preview-grid hidden" data-preview-grid></div>
        <div class="image-actions" data-image-actions>
          ${allowCamera ? `<button type="button" class="btn-primary camera-btn" data-camera-open>Take photo</button>` : ""}
          <button type="button" class="btn-secondary pick-images-btn" data-gallery-open>Choose file</button>
        </div>
        <input type="file" accept="image/*" class="hidden" data-image-input />
        <input type="file" accept="image/*" capture="environment" class="hidden" data-image-camera-native />
        <div class="camera-modal hidden" data-camera-modal>
          <div class="camera-modal-inner">
            <video autoplay playsinline muted data-camera-video></video>
            <canvas class="hidden" data-camera-canvas></canvas>
            <div class="camera-controls">
              <button type="button" class="btn-primary" data-camera-capture>Capture</button>
              <button type="button" class="btn-secondary" data-camera-cancel>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return "";
}

function syncSubCheckboxes(selectEl, field, config) {
  const fieldId = field.id;
  const wrap = selectEl.closest(`[data-dropdown-field="${fieldId}"]`);
  if (!wrap) return;

  const host = wrap.querySelector(`[data-sub-host="${fieldId}"]`);
  const hiddenSub = wrap.querySelector(`[data-sub-input="${fieldId}"]`);
  if (!host) return;

  const value = selectEl.value;
  host.querySelectorAll(".sub-checkbox-panel").forEach((panel) => {
    const match = panel.dataset.forOption === value;
    panel.classList.toggle("hidden", !match);
    if (!match) {
      panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
    }
  });

  if (!value) {
    if (hiddenSub) hiddenSub.value = "";
    return;
  }

  const opt = getFieldOption(config, fieldId, value);
  if (!opt?.subOptions?.length && hiddenSub) hiddenSub.value = "";
}

function updateSubCheckboxHidden(fieldId, config) {
  const wrap = document.querySelector(`[data-dropdown-field="${fieldId}"]`);
  if (!wrap) return;
  const selectEl = wrap.querySelector(`[data-field-id="${fieldId}"]`);
  const hiddenSub = wrap.querySelector(`[data-sub-input="${fieldId}"]`);
  const value = selectEl?.value;
  if (!value || !hiddenSub) {
    if (hiddenSub) hiddenSub.value = "";
    return;
  }

  const panel = wrap.querySelector(
    `.sub-checkbox-panel[data-for-option="${value}"]`
  );
  if (!panel) {
    hiddenSub.value = "";
    return;
  }

  const checked = Array.from(
    panel.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);
  hiddenSub.value = checked.length ? JSON.stringify(checked) : "";
}

function setupDropdownSubCheckboxes(formEl, config) {
  const fields = (config.fields || []).filter(
    (f) => f.type === "select" && f.displayAs !== "checkboxes" && f.enabled
  );

  for (const field of fields) {
    const selectEl = formEl.querySelector(`[data-field-id="${field.id}"][data-select-mode="dropdown"]`);
    if (!selectEl) continue;

    const onChange = () => {
      syncSubCheckboxes(selectEl, field, config);
      updateSubCheckboxHidden(field.id, config);
    };

    selectEl.onchange = onChange;

    const host = formEl.querySelector(`[data-sub-host="${field.id}"]`);
    if (host) {
      host.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.onchange = () => updateSubCheckboxHidden(field.id, config);
      });
    }

    onChange();
  }
}

function updateCheckboxTrigger(fieldId, panel, hiddenInput, placeholder) {
  const checked = panel.querySelectorAll('input[type="checkbox"]:checked');
  const labelEl = document.querySelector(`[data-trigger-label="${fieldId}"]`);
  if (!labelEl) return;

  const labels = Array.from(checked).map((cb) => {
    const span = cb.closest(".checkbox-option")?.querySelector("span");
    return span?.textContent || cb.value;
  });

  if (!labels.length) {
    labelEl.textContent = placeholder || "Select...";
    if (hiddenInput) hiddenInput.value = "";
    return;
  }

  const allowMultiple = panel.closest(".select-checkbox-field")?.dataset.allowMultiple === "1";
  labelEl.textContent = labels.join(", ");
  if (hiddenInput) {
    hiddenInput.value = allowMultiple
      ? JSON.stringify(Array.from(checked).map((cb) => cb.value))
      : checked[0].value;
  }
}

function setupSelectCheckboxFields(formEl, config) {
  const fields = (config.fields || []).filter(
    (f) => f.type === "select" && f.displayAs === "checkboxes" && f.enabled
  );

  formEl.addEventListener("click", (e) => {
    if (!e.target.closest(".select-checkbox-field")) {
      formEl.querySelectorAll(".checkbox-panel").forEach((p) => p.classList.add("hidden"));
      formEl.querySelectorAll(".select-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
    }
  });

  for (const field of fields) {
    const wrap = formEl.querySelector(`[data-field-id="${field.id}"].select-checkbox-field`);
    if (!wrap) continue;

    const trigger = wrap.querySelector(`[data-select-trigger="${field.id}"]`);
    const panel = wrap.querySelector(`[data-checkbox-panel="${field.id}"]`);
    const hiddenInput = wrap.querySelector(`[data-field-id="${field.id}"][data-select-mode="checkboxes"]`);
    const allowMultiple = field.allowMultiple === true;

    trigger.onclick = (e) => {
      e.preventDefault();
      const open = panel.classList.contains("hidden");
      formEl.querySelectorAll(".checkbox-panel").forEach((p) => p.classList.add("hidden"));
      formEl.querySelectorAll(".select-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
      if (open) {
        panel.classList.remove("hidden");
        trigger.setAttribute("aria-expanded", "true");
      }
    };

    panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.onchange = () => {
        if (!allowMultiple) {
          panel.querySelectorAll('input[type="checkbox"]').forEach((other) => {
            if (other !== cb) other.checked = false;
          });
          if (cb.checked) panel.classList.add("hidden");
          trigger.setAttribute("aria-expanded", "false");
        }
        updateCheckboxTrigger(field.id, panel, hiddenInput, field.placeholder);
      };
    });
  }
}

function renderTicketForm(formEl, config) {
  const enabled = (config.fields || [])
    .filter((f) => f.enabled)
    .sort((a, b) => a.order - b.order);

  const title = formEl.querySelector("[data-form-title]");
  const fieldsHost = formEl.querySelector("[data-form-fields]");
  const submitBtn = formEl.querySelector("[data-submit-btn]");

  if (title) title.textContent = config.title || "Raise New Issue";
  if (submitBtn) submitBtn.textContent = config.submitLabel || "Submit Ticket";
  if (!fieldsHost) return;

  fieldsHost.innerHTML = enabled.map((f) => renderField(f)).join("");
  setupDropdownSubCheckboxes(formEl, config);
  setupSelectCheckboxFields(formEl, config);
}

function collectValues(formEl, config) {
  const values = {};
  const enabled = (config.fields || []).filter((f) => f.enabled && f.type !== "images");

  for (const field of enabled) {
    if (field.type === "select" && field.displayAs === "checkboxes") {
      const hidden = formEl.querySelector(
        `[data-field-id="${field.id}"][data-select-mode="checkboxes"]`
      );
      if (hidden) values[field.id] = hidden.value;
      continue;
    }

    const el = formEl.querySelector(`[data-field-id="${field.id}"]`);
    if (el) values[field.id] = el.value;

    const subInput = formEl.querySelector(`[data-sub-input="${field.id}"]`);
    if (subInput && subInput.value) {
      values[`${field.id}_sub`] = subInput.value;
    }
  }

  return values;
}

function setupImagePicker(formEl, state) {
  const imageField = formEl.querySelector("[data-image-field]");
  if (!imageField) return;

  const max = parseInt(imageField.dataset.max || "2", 10);
  const allowCamera = imageField.dataset.allowCamera !== "0";
  const galleryInput = imageField.querySelector("[data-image-input]");
  const nativeCameraInput = imageField.querySelector("[data-image-camera-native]");
  const actionsEl = imageField.querySelector("[data-image-actions]");
  const cameraBtn = imageField.querySelector("[data-camera-open]");
  const galleryBtn = imageField.querySelector("[data-gallery-open]");
  const countEl = imageField.querySelector(".image-count");
  const grid = imageField.querySelector("[data-preview-grid]");
  const modal = imageField.querySelector("[data-camera-modal]");
  const video = imageField.querySelector("[data-camera-video]");
  const canvas = imageField.querySelector("[data-camera-canvas]");
  const captureBtn = imageField.querySelector("[data-camera-capture]");
  const cancelBtn = imageField.querySelector("[data-camera-cancel]");

  let cameraStream = null;

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    if (video) video.srcObject = null;
    modal?.classList.add("hidden");
  }

  function isClientImageFile(file) {
    if (file.type?.startsWith("image/")) return true;
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || "");
  }

  function addFiles(files) {
    const room = max - state.images.length;
    if (room <= 0) return;
    const picked = Array.from(files || []);
    const rejected = picked.filter((f) => !isClientImageFile(f));
    const incoming = picked.filter(isClientImageFile).slice(0, room);
    if (!incoming.length) {
      if (rejected.length) alert("Please choose a JPEG, PNG, or other image file.");
      return;
    }
    state.images = [...state.images, ...incoming];
    state.previewUrls = state.images.map((f) => URL.createObjectURL(f));
    updateUI();
  }

  function updateUI() {
    countEl.textContent = String(state.images.length);
    grid.innerHTML = "";
    const atMax = state.images.length >= max;

    if (!state.images.length) {
      grid.classList.add("hidden");
    } else {
      grid.classList.remove("hidden");
      state.previewUrls.forEach((url, i) => {
        const item = document.createElement("div");
        item.className = "preview-item";
        item.innerHTML = `<img src="${url}" alt="Preview" /><button type="button" class="preview-remove">Remove</button>`;
        item.querySelector("button").onclick = () => {
          URL.revokeObjectURL(state.previewUrls[i]);
          state.images.splice(i, 1);
          state.previewUrls.splice(i, 1);
          updateUI();
        };
        grid.appendChild(item);
      });
    }

    if (actionsEl) actionsEl.classList.toggle("hidden", atMax);
    if (atMax) stopCamera();
  }

  async function openLiveCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      nativeCameraInput?.click();
      return;
    }
    try {
      stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = cameraStream;
      modal.classList.remove("hidden");
    } catch {
      nativeCameraInput?.click();
    }
  }

  captureBtn?.addEventListener("click", () => {
    if (!video?.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        stopCamera();
        addFiles([file]);
      },
      "image/jpeg",
      0.92
    );
  });

  cancelBtn?.addEventListener("click", stopCamera);

  cameraBtn?.addEventListener("click", openLiveCamera);
  galleryBtn?.addEventListener("click", () => galleryInput?.click());

  galleryInput?.addEventListener("change", (e) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = "";
  });

  nativeCameraInput?.addEventListener("change", (e) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = "";
  });

  state.resetImages = () => {
    stopCamera();
    state.previewUrls.forEach((u) => URL.revokeObjectURL(u));
    state.images = [];
    state.previewUrls = [];
    updateUI();
  };

  updateUI();
}

function validateImages(formEl, config) {
  const field = getImageField(config);
  if (!field || !field.enabled) return null;
  const imageField = formEl.querySelector("[data-image-field]");
  if (!imageField) return null;
  const countEl = imageField.querySelector(".image-count");
  const count = parseInt(countEl?.textContent || "0", 10);
  const max = field.maxCount || 2;
  if (field.required && count !== max) {
    return `Please upload exactly ${max} image(s)`;
  }
  return null;
}

function renderTicketExtraFields(ticket, config) {
  const extras = [];
  const formData = ticket.formData || {};

  for (const field of (config.fields || []).filter((f) => f.enabled)) {
    if (CORE_IDS.has(field.id)) continue;
    const val = formData[field.id];
    if (!val) continue;
    let display =
      field.type === "select"
        ? formatSelectDisplay(config, field.id, val)
        : val;
    const sub = formData[`${field.id}_sub`];
    const subDisplay = formatSubOptionDisplay(config, field.id, val, sub);
    if (subDisplay) display += ` (${subDisplay})`;
    extras.push(
      `<div class="ticket-extra-row"><span class="ticket-extra-label">${escapeHtml(field.label)}</span><span class="ticket-extra-value">${escapeHtml(display)}</span></div>`
    );
  }

  return extras.length ? `<div class="ticket-extras">${extras.join("")}</div>` : "";
}

window.FormBuilder = {
  CORE_IDS,
  getLabelMaps,
  resolveOptionLabel,
  formatSelectDisplay,
  formatSubOptionDisplay,
  parseSelectValue,
  getFieldOption,
  getImageField,
  renderTicketForm,
  collectValues,
  setupImagePicker,
  setupDropdownSubCheckboxes,
  setupSelectCheckboxFields,
  validateImages,
  renderTicketExtraFields,
  escapeHtml,
};
