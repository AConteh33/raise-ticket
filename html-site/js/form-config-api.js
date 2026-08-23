async function fetchFormConfig() {
  const res = await Api.apiFetch("/api/form-config");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load form config");
  return data.config;
}

async function saveFormConfig(config) {
  const res = await Api.apiFetch("/api/form-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save form config");
  return data.config;
}

window.FormConfigApi = { fetchFormConfig, saveFormConfig };
