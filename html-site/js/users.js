async function listUsers() {
  const res = await Api.apiFetch("/api/users");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load users");
  return data.users.map((u) => ({ ...u, createdAt: new Date(u.createdAt) }));
}

async function createUserAccount(input) {
  const res = await Api.apiFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create user");
}

async function updateUserRole(userId, role) {
  const res = await Api.apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update role");
  return data.user;
}

async function deleteUser(userId) {
  const res = await Api.apiFetch(`/api/users/${userId}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete user");
}

window.Users = { listUsers, createUserAccount, updateUserRole, deleteUser };
