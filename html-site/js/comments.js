async function addComment(ticketId, body) {
  const res = await Api.apiFetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to add comment");
  return { ...data.comment, createdAt: new Date(data.comment.createdAt) };
}

function subscribeToTicketComments(ticketId, onUpdate) {
  let active = true;

  function emit(state) {
    if (active) onUpdate(state);
  }

  async function load() {
    try {
      const res = await Api.apiFetch(`/api/tickets/${ticketId}/comments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load comments");
      emit({
        comments: data.comments.map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt),
        })),
        loading: false,
        error: null,
      });
    } catch (err) {
      emit({
        comments: [],
        loading: false,
        error: err.message || "Failed to load comments",
      });
    }
  }

  emit({ comments: [], loading: true, error: null });
  load();
  const interval = setInterval(load, 5000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

window.Comments = { addComment, subscribeToTicketComments };
