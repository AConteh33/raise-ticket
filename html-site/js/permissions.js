const { DEPARTMENT_ROLES } = window.APP_CONSTANTS;

function isDepartmentRole(role) {
  return DEPARTMENT_ROLES.includes(role);
}

function canViewAllTickets(role) {
  return role === "admin" || role === "analysts";
}

function canCreateTickets(role) {
  return role === "admin" || isDepartmentRole(role);
}

function canEditTicket(role, ticketOwnerUid, userUid) {
  if (!role || !userUid) return false;
  if (role === "admin") return true;
  if (role === "analysts") return false;
  if (isDepartmentRole(role)) return ticketOwnerUid === userUid;
  return false;
}

function canDeleteTicket(role) {
  return role === "admin";
}

function canCommentTicket(role, ticketOwnerUid, userUid) {
  if (!role || !userUid) return false;
  if (role === "admin") return true;
  if (isDepartmentRole(role)) return ticketOwnerUid === userUid;
  return false;
}

window.Permissions = {
  canViewAllTickets,
  canCreateTickets,
  canEditTicket,
  canDeleteTicket,
  canCommentTicket,
};
