async function addComment(ticketId, text) {
  const profile = Auth.getCurrentProfile();
  await db.collection("ticket_comments").add({
    ticketId,
    text,
    userId: Auth.getCurrentUser()?.uid || "",
    userName: profile?.displayName || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function getComments(ticketId) {
  const snap = await db.collection("ticket_comments")
    .where("ticketId", "==", ticketId)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function subscribeToComments(ticketId, callback) {
  return db.collection("ticket_comments")
    .where("ticketId", "==", ticketId)
    .orderBy("createdAt", "asc")
    .onSnapshot((snap) => {
      callback(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
}

window.Comments = { addComment, getComments, subscribeToComments };
