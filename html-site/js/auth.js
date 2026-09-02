let currentUser = null;
let currentUserProfile = null;
let authReady = false;
const authListeners = [];

function onAuthChange(cb) {
  authListeners.push(cb);
  if (authReady) cb({ user: currentUser, profile: currentUserProfile, ready: true });
}

function notifyAuth() {
  authListeners.forEach((cb) => cb({ user: currentUser, profile: currentUserProfile, ready: true }));
}

fbAuth.onAuthStateChanged(async (fbUser) => {
  if (fbUser) {
    currentUser = fbUser;
    const snap = await db.collection("users").doc(fbUser.uid).get();
    currentUserProfile = snap.exists ? { id: snap.id, ...snap.data() } : null;
  } else {
    currentUser = null;
    currentUserProfile = null;
  }
  authReady = true;
  notifyAuth();
});

async function login(email, password) {
  const cred = await fbAuth.signInWithEmailAndPassword(email, password);
  const snap = await db.collection("users").doc(cred.user.uid).get();
  if (!snap.exists) throw new Error("Account exists but has no profile. Contact admin.");
  currentUserProfile = { id: snap.id, ...snap.data() };
}

async function logout() {
  await fbAuth.signOut();
  currentUser = null;
  currentUserProfile = null;
}

function getCurrentUser() { return currentUser; }
function getCurrentProfile() { return currentUserProfile; }

window.Auth = {
  initAuth() {},
  onAuthChange,
  login,
  logout,
  getCurrentUser,
  getCurrentProfile,
  friendlyAuthError: (err) => {
    const msg = err?.message || "Sign in failed";
    if (msg.includes("user-not-found")) return "No account found with this email.";
    if (msg.includes("wrong-password") || msg.includes("invalid-credential")) return "Invalid email or password.";
    if (msg.includes("too-many-requests")) return "Too many attempts. Try again later.";
    return msg;
  },
};
