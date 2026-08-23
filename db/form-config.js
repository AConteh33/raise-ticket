const { getDb, nowIso } = require("./index");
const {
  DEFAULT_FORM_CONFIG,
  COMPLIANCE_OFFICERS,
  ISSUE_CATEGORIES,
  CORE_FIELD_IDS,
} = require("./excel-fields");

const SETTINGS_KEY = "ticket_form_config";

function normalizeConfig(config) {
  const merged = {
    title: config.title || DEFAULT_FORM_CONFIG.title,
    submitLabel: config.submitLabel || DEFAULT_FORM_CONFIG.submitLabel,
    fields: (config.fields || [])
      .filter((f) => f && f.id && f.type)
      .map((field, index) => ({
        ...field,
        order: typeof field.order === "number" ? field.order : index,
        enabled: field.enabled !== false,
        required: field.required === true,
        displayAs:
          field.type === "select"
            ? field.displayAs === "dropdown"
              ? "dropdown"
              : "checkboxes"
            : undefined,
        allowMultiple:
          field.type === "select" ? field.allowMultiple === true : undefined,
        allowCamera:
          field.type === "images" ? field.allowCamera !== false : undefined,
        requireSubWhenAvailable:
          field.type === "select" ? field.requireSubWhenAvailable !== false : undefined,
        options: Array.isArray(field.options)
          ? field.options
              .filter((o) => o && o.value && o.label)
              .map((o) => ({
                value: o.value,
                label: o.label,
                subOptions: Array.isArray(o.subOptions)
                  ? o.subOptions.filter((s) => s && s.value && s.label)
                  : [],
              }))
          : undefined,
      }))
      .sort((a, b) => a.order - b.order),
  };

  if (!merged.fields.length) {
    return structuredClone(DEFAULT_FORM_CONFIG);
  }

  return merged;
}

function getFormConfig() {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(SETTINGS_KEY);

  if (!row) {
    return structuredClone(DEFAULT_FORM_CONFIG);
  }

  try {
    return normalizeConfig(JSON.parse(row.value));
  } catch {
    return structuredClone(DEFAULT_FORM_CONFIG);
  }
}

function saveFormConfig(config, actorUid) {
  const normalized = normalizeConfig(config);
  const db = getDb();
  const ts = nowIso();

  db.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(SETTINGS_KEY, JSON.stringify(normalized), ts, actorUid);

  return normalized;
}

function getEnabledFields(config) {
  return config.fields.filter((f) => f.enabled);
}

function getLabelMaps(config) {
  const issueTypes = {};
  const fieldLabels = {};

  for (const field of config.fields) {
    fieldLabels[field.id] = field.label;
    if (field.id === "issueType" && field.options) {
      for (const opt of field.options) issueTypes[opt.value] = opt.label;
    }
    if (field.type === "select" && field.options && !CORE_FIELD_IDS.has(field.id)) {
      fieldLabels[`__options_${field.id}`] = Object.fromEntries(
        field.options.map((o) => [o.value, o.label])
      );
    }
  }

  return { issueTypes, fieldLabels };
}

function isUploadableImage(file) {
  if (!file || !file.buffer?.length) return false;

  const mime = file.mimetype || "";
  if (mime.startsWith("image/")) return true;

  const name = (file.originalname || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(name)) return true;

  const buf = file.buffer;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return true;
  }

  return mime === "application/octet-stream" || mime === "";
}

function resolveImageMimeType(file) {
  const mime = file.mimetype || "";
  if (mime.startsWith("image/")) return mime;

  const buf = file.buffer;
  if (buf?.[0] === 0xff && buf?.[1] === 0xd8) return "image/jpeg";
  if (buf?.[0] === 0x89 && buf?.[1] === 0x50) return "image/png";
  if (buf?.[0] === 0x47 && buf?.[1] === 0x49) return "image/gif";
  if (buf?.length >= 12 && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";

  return "image/jpeg";
}

function validateSubmission(config, body, files) {
  const errors = [];
  const values = {};
  const enabled = getEnabledFields(config);

  for (const field of enabled) {
    if (field.type === "images") {
      const maxCount = field.maxCount || 2;
      const count = files ? files.length : 0;
      if (field.required && count !== maxCount) {
        errors.push(`Exactly ${maxCount} image(s) required`);
      } else if (count > maxCount) {
        errors.push(`Maximum ${maxCount} image(s) allowed`);
      }
      const maxMb = field.maxSizeMb || 5;
      for (const file of files || []) {
        if (!isUploadableImage(file)) {
          errors.push(`"${file.originalname || "file"}" is not a supported image`);
        }
        if (file.size > maxMb * 1024 * 1024) {
          errors.push(`"${file.originalname}" exceeds ${maxMb}MB`);
        }
      }
      continue;
    }

    const raw = body[field.id];
    let value = raw != null ? String(raw).trim() : "";

    if (field.type === "select" && field.allowMultiple && value) {
      let selected = [];
      try {
        const parsed = JSON.parse(value);
        selected = Array.isArray(parsed) ? parsed.map(String) : [value];
      } catch {
        selected = value.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const allowed = new Set((field.options || []).map((o) => o.value));
      selected = selected.filter((v) => allowed.has(v));
      if (field.required && !selected.length) {
        errors.push(`${field.label} is required`);
        continue;
      }
      if (selected.length) {
        values[field.id] = JSON.stringify(selected);
      }
      continue;
    }

    if (field.required && !value) {
      errors.push(`${field.label} is required`);
      continue;
    }

    if (!value) continue;

    if (field.type === "select") {
      const allowed = new Set((field.options || []).map((o) => o.value));
      if (!allowed.has(value)) {
        errors.push(`Invalid value for ${field.label}`);
        continue;
      }

      const selectedOpt = (field.options || []).find((o) => o.value === value);
      const subKey = `${field.id}_sub`;
      const subRaw = body[subKey] != null ? String(body[subKey]).trim() : "";
      let subSelected = [];
      if (subRaw) {
        try {
          const parsed = JSON.parse(subRaw);
          subSelected = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          subSelected = subRaw.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      if (selectedOpt?.subOptions?.length) {
        const subAllowed = new Set(selectedOpt.subOptions.map((s) => s.value));
        subSelected = subSelected.filter((v) => subAllowed.has(v));
        const needSub = field.requireSubWhenAvailable !== false;
        if (needSub && !subSelected.length) {
          errors.push(`Select at least one option for ${selectedOpt.label}`);
          continue;
        }
        if (subSelected.length) values[subKey] = JSON.stringify(subSelected);
      }

      values[field.id] = value;
      continue;
    }

    values[field.id] = value;
  }

  return { errors, values };
}

function resolveOfficerForUser(user) {
  const name = String(user?.displayName || "").trim();
  if (!name) return "";
  const match = COMPLIANCE_OFFICERS.find(
    (o) => o.label.toLowerCase() === name.toLowerCase()
  );
  return match ? match.value : name;
}

function mapToTicketInput(values, user) {
  const issueType = values.issueType || "unspecified";

  return {
    applicantName: values.applicantName || "—",
    phoneNumber: values.phoneNumber || "—",
    issueType: typeof issueType === "string" ? issueType : "unspecified",
    explanation: values.explanation || "—",
    leavingSoon: "no",
    nin: values.nin || "",
    issueSolution: values.issueSolution || "",
    calledDate: values.calledDate || "",
    complianceOfficer: resolveOfficerForUser(user),
    issueCategory2: values.issueCategory2 || "",
    formData: values,
    createdByUid: user.uid,
    createdByName: user.displayName,
    createdByRole: user.role,
  };
}

function validateAdminConfig(config) {
  const errors = [];
  const ids = new Set();

  for (const field of config.fields || []) {
    if (!field.id || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.id)) {
      errors.push("Each field needs a valid id (letters, numbers, underscore)");
    }
    if (ids.has(field.id)) errors.push(`Duplicate field id: ${field.id}`);
    ids.add(field.id);

    if (!field.label?.trim()) errors.push(`Field "${field.id}" needs a label`);

    if (field.type === "select" && (!field.options || !field.options.length)) {
      errors.push(`Select field "${field.id}" needs at least one option`);
    }

    if (field.type === "select" && field.allowMultiple) {
      if (field.id === "issueType" || field.id === "complianceOfficer") {
        errors.push(`"${field.id}" cannot allow multiple selections`);
      }
    }

    if (field.type === "images") {
      if (!field.maxCount || field.maxCount < 1 || field.maxCount > 10) {
        errors.push("Image field max count must be between 1 and 10");
      }
    }
  }

  return errors;
}

module.exports = {
  DEFAULT_FORM_CONFIG,
  COMPLIANCE_OFFICERS,
  ISSUE_CATEGORIES,
  CORE_FIELD_IDS,
  getFormConfig,
  saveFormConfig,
  getEnabledFields,
  getLabelMaps,
  validateSubmission,
  mapToTicketInput,
  validateAdminConfig,
  normalizeConfig,
  isUploadableImage,
  resolveImageMimeType,
};
