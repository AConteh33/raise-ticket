let currentUser = null;
let currentProfile = null;
let authReady = false;
const authListeners = [];

function onAuthChange(callback) {
  authListeners.push(callback);
  if (authReady) {
    callback({ user: currentUser, profile: currentProfile, ready: true });
  }
}

function notifyAuthChange() {
  if (!authReady) return;
  for (const cb of authListeners) {
    cb({ user: currentUser, profile: currentProfile, ready: true });
  }
}

async function refresh() {
  try {
    const res = await Api.apiFetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      currentProfile = data.user;
    } else {
      currentUser = null;
      currentProfile = null;
    }
  } catch {
    currentUser = null;
    currentProfile = null;
  }
  authReady = true;
  notifyAuthChange();
}

function initAuth() {
  if (!authReady) refresh();
}

async function login(email, password) {
  const res = await Api.apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sign in failed");
  currentUser = data.user;
  currentProfile = data.user;
  authReady = true;
  notifyAuthChange();
}

async function logout() {
  await Api.apiFetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  currentProfile = null;
  authReady = true;
  notifyAuthChange();
}

function getCurrentUser() {
  return currentUser;
}

function getCurrentProfile() {
  return currentProfile;
}

window.Auth = {
  initAuth,
  onAuthChange,
  login,
  logout,
  getCurrentUser,
  getCurrentProfile,
  friendlyAuthError: (err) => {
    const msg = err?.message || "Sign in failed";
    if (msg === "Failed to fetch" || msg === "Load failed" || msg === "NetworkError when attempting to fetch resource.") {
      return "Cannot reach the server. Open http://localhost:8080 and make sure the project is running.";
    }
    return msg;
  },
};
