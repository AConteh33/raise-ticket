async function createTicket(values, images) {
  const profile = Auth.getCurrentProfile();
  const ticket = {
    applicantName: values.applicantName || "",
    nin: values.nin || "",
    contactNumber: values.contactNumber || "",
    called: values.called || "",
    category: values.category || "",
    issue: values.issue || "",
    solution: values.solution || "",
    complianceOfficer: profile ? profile.displayName : "",
    status: "open",
    escalatedTo: [],
    createdByUid: Auth.getCurrentUser()?.uid || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection("tickets").add(ticket);

  if (images && images.length > 0) {
    for (const img of images) {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(img);
      });
      await db.collection("ticket_images").add({
        ticketId: docRef.id,
        dataUrl,
        fileName: img.name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  await db.collection("activity_logs").add({
    ticketId: docRef.id,
    action: "created",
    userId: Auth.getCurrentUser()?.uid || "",
    userName: profile?.displayName || "",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return { id: docRef.id };
}

async function updateTicket(id, values) {
  await db.collection("tickets").doc(id).update({
    applicantName: values.applicantName || "",
    nin: values.nin || "",
    contactNumber: values.contactNumber || "",
    called: values.called || "",
    category: values.category || "",
    issue: values.issue || "",
    solution: values.solution || "",
  });
}

async function updateTicketStatus(id, status) {
  const profile = Auth.getCurrentProfile();
  await db.collection("tickets").doc(id).update({ status });
  await db.collection("activity_logs").add({
    ticketId: id,
    action: `status → ${status}`,
    userId: Auth.getCurrentUser()?.uid || "",
    userName: profile?.displayName || "",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteTicket(id) {
  await db.collection("tickets").doc(id).delete();
  const images = await db.collection("ticket_images").where("ticketId", "==", id).get();
  images.forEach((doc) => doc.ref.delete());
  const comments = await db.collection("ticket_comments").where("ticketId", "==", id).get();
  comments.forEach((doc) => doc.ref.delete());
  const logs = await db.collection("activity_logs").where("ticketId", "==", id).get();
  logs.forEach((doc) => doc.ref.delete());
}

function subscribeToTickets(callback) {
  return db.collection("tickets").orderBy("createdAt", "desc").onSnapshot((snap) => {
    const tickets = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(tickets);
  });
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
