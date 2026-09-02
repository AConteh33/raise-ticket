async function getActivity(ticketId) {
  const snap = await db.collection("activity_logs")
    .where("ticketId", "==", ticketId)
    .orderBy("timestamp", "desc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function subscribeToActivity(ticketId, callback) {
  return db.collection("activity_logs")
    .where("ticketId", "==", ticketId)
    .orderBy("timestamp", "desc")
    .onSnapshot((snap) => {
      callback(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
}

window.Activity = { getActivity, subscribeToActivity };
