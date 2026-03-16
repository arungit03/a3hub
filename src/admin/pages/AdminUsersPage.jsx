import { useMemo, useState } from "react";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signOut as signOutAuth,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { db, firebaseConfig } from "../../lib/firebase";
import { useAuth } from "../../state/auth";
import { AUDIT_ACTIONS, logAuditEvent } from "../lib/auditLogs";
import { normalizeRole, normalizeStatus } from "../lib/format";

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "student", label: "Students" },
  { value: "staff", label: "Staff" },
  { value: "parent", label: "Parents" },
  { value: "admin", label: "Admin" },
];

const ROLE_UPDATE_OPTIONS = ["student", "staff", "parent"];

const toSafeText = (value) => String(value || "").trim();

const createSecondaryStaffAuthAccount = async ({ email, password, name }) => {
  const appName = `ckcethub-admin-provision-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    if (name) {
      await updateProfile(credential.user, { displayName: name }).catch(() => {});
    }
    await sendEmailVerification(credential.user).catch(() => {});
    return credential.user.uid;
  } finally {
    await signOutAuth(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
};

export default function AdminUsersPage() {
  const { user, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState("");
  const [actionBusyId, setActionBusyId] = useState("");
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    designation: "Faculty",
  });

  const usersQuery = useMemo(() => query(collection(db, "users"), limit(2000)), []);
  const usersState = useRealtimeCollection(usersQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load users.",
  });

  const performedBy = useMemo(
    () => ({
      uid: user?.uid || "",
      name: profile?.name || user?.displayName || user?.email || "Admin",
      email: user?.email || "",
      role: profile?.role || "admin",
    }),
    [profile?.name, profile?.role, user?.displayName, user?.email, user?.uid]
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = toSafeText(searchTerm).toLowerCase();

    return (usersState.data || [])
      .filter((item) => {
        const role = normalizeRole(item.role);
        if (roleFilter !== "all" && role !== roleFilter) return false;
        if (!normalizedSearch) return true;
        const name = toSafeText(item.name).toLowerCase();
        const email = toSafeText(item.email).toLowerCase();
        return name.includes(normalizedSearch) || email.includes(normalizedSearch);
      })
      .sort((a, b) =>
        toSafeText(a.name || a.email).localeCompare(toSafeText(b.name || b.email))
      );
  }, [roleFilter, searchTerm, usersState.data]);

  const handleCreateStaff = async (event) => {
    event.preventDefault();
    if (creatingStaff) return;

    const name = toSafeText(staffForm.name);
    const email = toSafeText(staffForm.email).toLowerCase();
    const password = toSafeText(staffForm.password);
    const department = toSafeText(staffForm.department);
    const designation = toSafeText(staffForm.designation) || "Faculty";

    if (!name || !email || !password || !department) {
      setStatusMessage("Name, email, password, and department are required.");
      return;
    }
    if (password.length < 6) {
      setStatusMessage("Staff password must be at least 6 characters.");
      return;
    }

    setCreatingStaff(true);
    setStatusMessage("");

    try {
      const uid = await createSecondaryStaffAuthAccount({ email, password, name });

      await setDoc(doc(db, "users", uid), {
        name,
        email,
        role: "staff",
        status: "active",
        department,
        departmentKey: department.toLowerCase(),
        designation,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        createdByName: performedBy.name,
      });

      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        module: "users",
        targetId: uid,
        performedBy,
        metadata: {
          role: "staff",
          reason: "staff_account_created",
        },
      }).catch(() => {});

      setStaffForm({
        name: "",
        email: "",
        password: "",
        department: "",
        designation: "Faculty",
      });
      setStatusMessage("Staff account created and verification email sent.");
    } catch (error) {
      setStatusMessage(error?.message || "Unable to create staff account.");
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleRoleChange = async (userItem, nextRole) => {
    if (!userItem?.id || actionBusyId) return;
    if (userItem.id === user?.uid) {
      setStatusMessage("You cannot change your own role.");
      return;
    }

    const safeNextRole = normalizeRole(nextRole);
    if (!ROLE_UPDATE_OPTIONS.includes(safeNextRole)) {
      setStatusMessage("Invalid role update.");
      return;
    }

    setActionBusyId(userItem.id);
    setStatusMessage("");
    try {
      const previousRole = normalizeRole(userItem.role);
      await updateDoc(doc(db, "users", userItem.id), {
        role: safeNextRole,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        module: "users",
        targetId: userItem.id,
        performedBy,
        metadata: {
          previousRole,
          nextRole: safeNextRole,
        },
      }).catch(() => {});
      setStatusMessage("User role updated.");
    } catch {
      setStatusMessage("Unable to update role.");
    } finally {
      setActionBusyId("");
    }
  };

  const handleToggleStatus = async (userItem) => {
    if (!userItem?.id || actionBusyId) return;
    if (userItem.id === user?.uid) {
      setStatusMessage("You cannot block your own account.");
      return;
    }

    const currentStatus = normalizeStatus(userItem.status);
    const nextStatus =
      currentStatus === "blocked" || currentStatus === "pending"
        ? "active"
        : "blocked";
    setActionBusyId(userItem.id);
    setStatusMessage("");

    try {
      await updateDoc(doc(db, "users", userItem.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || null,
      });
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
        module: "users",
        targetId: userItem.id,
        performedBy,
        metadata: {
          previousStatus: currentStatus,
          nextStatus,
        },
      }).catch(() => {});
      setStatusMessage(`User ${nextStatus === "blocked" ? "blocked" : "activated"}.`);
    } catch {
      setStatusMessage("Unable to update user status.");
    } finally {
      setActionBusyId("");
    }
  };

  const handleDeleteUser = async (userItem) => {
    if (!userItem?.id || actionBusyId) return;
    if (userItem.id === user?.uid) {
      setStatusMessage("You cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this user from Firestore profile data? Auth account removal requires backend admin SDK."
    );
    if (!confirmed) return;

    setActionBusyId(userItem.id);
    setStatusMessage("");

    try {
      await deleteDoc(doc(db, "users", userItem.id));
      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.USER_DELETED,
        module: "users",
        targetId: userItem.id,
        performedBy,
        metadata: {
          email: userItem.email || "",
        },
      }).catch(() => {});
      setStatusMessage("User Firestore profile deleted.");
    } catch {
      setStatusMessage("Unable to delete user.");
    } finally {
      setActionBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          User Management
        </p>
        <h2 className="text-2xl font-bold text-slate-900">Manage Users and Roles</h2>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Create Staff Account</h3>
        <p className="text-xs text-slate-500">
          Creates Firebase Auth account + Firestore profile with `staff` role.
        </p>

        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleCreateStaff}>
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Full name"
            value={staffForm.name}
            onChange={(event) =>
              setStaffForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={staffForm.email}
            onChange={(event) =>
              setStaffForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Temporary password"
            type="password"
            value={staffForm.password}
            onChange={(event) =>
              setStaffForm((prev) => ({ ...prev, password: event.target.value }))
            }
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Department"
            value={staffForm.department}
            onChange={(event) =>
              setStaffForm((prev) => ({ ...prev, department: event.target.value }))
            }
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            placeholder="Designation"
            value={staffForm.designation}
            onChange={(event) =>
              setStaffForm((prev) => ({ ...prev, designation: event.target.value }))
            }
          />
          <button
            type="submit"
            disabled={creatingStaff}
            className="md:col-span-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {creatingStaff ? "Creating staff account..." : "Create Staff"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:w-72"
            placeholder="Search by name or email"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            {ROLE_FILTER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {usersState.loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading users...</p>
        ) : null}
        {usersState.error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {usersState.error}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((item) => {
                const normalizedRole = normalizeRole(item.role);
                const normalizedStatus = normalizeStatus(item.status);
                const isSelf = item.id === user?.uid;

                return (
                  <tr key={item.id}>
                    <td className="px-2 py-3 font-semibold text-slate-900">
                      {item.name || "-"}
                    </td>
                    <td className="px-2 py-3 text-slate-600">{item.email || "-"}</td>
                    <td className="px-2 py-3">
                      {normalizedRole === "admin" ? (
                        <span className="inline-flex rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                          admin
                        </span>
                      ) : (
                        <select
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          value={normalizedRole}
                          disabled={actionBusyId === item.id || isSelf}
                          onChange={(event) =>
                            handleRoleChange(item, event.target.value)
                          }
                        >
                          {ROLE_UPDATE_OPTIONS.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {roleOption}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          normalizedStatus === "blocked"
                            ? "bg-rose-100 text-rose-700"
                            : normalizedStatus === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {normalizedStatus}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionBusyId === item.id || isSelf}
                          onClick={() => handleToggleStatus(item)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                        >
                          {normalizedStatus === "blocked"
                            ? "Activate"
                            : normalizedStatus === "pending"
                            ? "Approve"
                            : "Block"}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === item.id || isSelf}
                          onClick={() => handleDeleteUser(item)}
                          className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && !usersState.loading ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={5}>
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {statusMessage ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
