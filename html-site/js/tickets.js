async function fetchTickets() {
  const res = await Api.apiFetch("/api/tickets");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load tickets");
  return data.tickets.map((t) => ({
    ...t,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
    imageUrls: (t.imageUrls || []).map((url) => Api.apiUrl(url)),
  }));
}

async function createTicket(values, images) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value != null && value !== "") formData.append(key, value);
  }
  (images || []).forEach((image, index) => {
    const filename = image.name || `image-${index + 1}.jpg`;
    formData.append("images", image, filename);
  });

  const res = await Api.apiFetch("/api/tickets", { method: "POST", body: formData });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Failed to create ticket");
  }
  if (!res.ok) throw new Error(data.error || "Failed to create ticket");

  return {
    ...data.ticket,
    imageUrls: (data.ticket?.imageUrls || []).map((url) => Api.apiUrl(url)),
  };
}

async function updateTicket(ticketId, updates) {
  const res = await Api.apiFetch(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update");
}

async function updateTicketStatus(ticketId, status) {
  return updateTicket(ticketId, { status });
}

async function deleteTicket(ticketId) {
  const res = await Api.apiFetch(`/api/tickets/${ticketId}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete");
}

function subscribeToTickets(onData, onError) {
  let active = true;
  async function load() {
    try {
      const tickets = await fetchTickets();
      if (active) onData(tickets);
    } catch (err) {
      if (active) onError(err);
    }
  }
  load();
  const interval = setInterval(load, 4000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

function checkDuplicateClient(applicantName, nin, excludeId, allTickets) {
  const name = (applicantName || "").trim().toLowerCase();
  const ninVal = (nin || "").trim().toLowerCase();

  if (!name && !ninVal) return null;

  return allTickets.find((t) => {
    if (t.id === excludeId) return false;
    if (t.status !== "open" && t.status !== "in_progress") return false;

    if (name && (t.applicantName || "").trim().toLowerCase() === name) return true;
    if (ninVal && (t.nin || "").trim().toLowerCase() === ninVal) return true;
    return false;
  }) || null;
}

window.Tickets = { createTicket, updateTicket, updateTicketStatus, deleteTicket, subscribeToTickets, checkDuplicateClient };
