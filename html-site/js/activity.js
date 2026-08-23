function subscribeToTicketActivity(ticketId, onUpdate) {
  let active = true;

  function emit(state) {
    if (active) onUpdate(state);
  }

  async function load() {
    try {
      const res = await Api.apiFetch(`/api/tickets/${ticketId}/activity`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load activity");
      emit({
        logs: data.logs.map((log) => ({
          ...log,
          createdAt: new Date(log.createdAt),
        })),
        loading: false,
        error: null,
      });
    } catch (err) {
      emit({
        logs: [],
        loading: false,
        error: err.message || "Failed to load activity",
      });
    }
  }

  emit({ logs: [], loading: true, error: null });
  load();
  const interval = setInterval(load, 5000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

window.Activity = { subscribeToTicketActivity };
