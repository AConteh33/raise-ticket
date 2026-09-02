const Users = {
  async list() {
    const snap = await db.collection("users").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async create({ email, password, name, role }) {
    const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
    await db.collection("users").doc(cred.user.uid).set({
      email,
      displayName: name,
      role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { id: cred.user.uid, email, displayName: name, role };
  },

  async updateRole(uid, role) {
    await db.collection("users").doc(uid).update({ role });
  },

  async remove(uid) {
    await db.collection("users").doc(uid).delete();
  },
};

window.Users = Users;
