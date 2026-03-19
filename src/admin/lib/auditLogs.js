import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export const AUDIT_ACTIONS = {
  USER_ROLE_CHANGED: "user_role_changed",
  USER_STATUS_CHANGED: "user_status_changed",
  USER_DELETED: "user_deleted",
  MARKS_UPDATED: "marks_updated",
  TEST_DELETED: "test_deleted",
  TEST_UPDATED: "test_updated",
  NOTICE_APPROVED: "notice_approved",
  NOTICE_REJECTED: "notice_rejected",
  SETTINGS_UPDATED: "settings_updated",
  ACADEMICS_UPDATED: "academics_updated",
  LEARNING_UPDATED: "learning_updated",
};

export const createAuditPayload = ({
  action,
  module,
  targetId,
  performedBy,
  metadata,
}) => ({
  action: String(action || "").trim(),
  module: String(module || "").trim() || "general",
  targetId: String(targetId || "").trim() || "-",
  performedBy: {
    uid: String(performedBy?.uid || ""),
    name: String(performedBy?.name || performedBy?.email || "Admin"),
    email: String(performedBy?.email || ""),
    role: String(performedBy?.role || "admin"),
  },
  metadata: metadata && typeof metadata === "object" ? metadata : {},
  timestamp: serverTimestamp(),
});

export const logAuditEvent = async ({
  db,
  action,
  module,
  targetId,
  performedBy,
  metadata = {},
}) => {
  const payload = createAuditPayload({
    action,
    module,
    targetId,
    performedBy,
    metadata,
  });

  await addDoc(collection(db, "auditLogs"), payload);
};
