import { useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  limit,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useRealtimeCollection } from "../hooks/useRealtimeCollection";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";
import { AUDIT_ACTIONS, logAuditEvent } from "../lib/auditLogs";
import { normalizeRole } from "../lib/format";

const toSafeText = (value) => String(value || "").trim();

export default function AdminAcademicsPage() {
  const { user, profile } = useAuth();
  const [statusMessage, setStatusMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "" });
  const [classForm, setClassForm] = useState({
    name: "",
    departmentId: "",
    semester: "",
  });
  const [subjectForm, setSubjectForm] = useState({
    name: "",
    code: "",
    departmentId: "",
    staffId: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    studentId: "",
    classId: "",
    semester: "",
  });

  const departmentsQuery = useMemo(
    () => query(collection(db, "departments"), limit(200)),
    []
  );
  const subjectsQuery = useMemo(
    () => query(collection(db, "subjects"), limit(500)),
    []
  );
  const classesQuery = useMemo(() => query(collection(db, "classes"), limit(300)), []);
  const usersQuery = useMemo(() => query(collection(db, "users"), limit(2000)), []);

  const departmentsState = useRealtimeCollection(departmentsQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load departments.",
  });
  const subjectsState = useRealtimeCollection(subjectsQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load subjects.",
  });
  const classesState = useRealtimeCollection(classesQuery, {
    map: (docItem) => ({ id: docItem.id, ...docItem.data() }),
    onErrorMessage: "Unable to load classes.",
  });
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

  const staffUsers = useMemo(
    () =>
      (usersState.data || [])
        .filter((item) => normalizeRole(item.role) === "staff")
        .sort((a, b) =>
          toSafeText(a.name || a.email).localeCompare(toSafeText(b.name || b.email))
        ),
    [usersState.data]
  );
  const studentUsers = useMemo(
    () =>
      (usersState.data || [])
        .filter((item) => normalizeRole(item.role) === "student")
        .sort((a, b) =>
          toSafeText(a.name || a.email).localeCompare(toSafeText(b.name || b.email))
        ),
    [usersState.data]
  );

  const departmentById = useMemo(() => {
    const index = new Map();
    (departmentsState.data || []).forEach((item) => index.set(item.id, item));
    return index;
  }, [departmentsState.data]);

  const staffById = useMemo(() => {
    const index = new Map();
    staffUsers.forEach((item) => index.set(item.id, item));
    return index;
  }, [staffUsers]);

  const logAcademicChange = async (targetId, metadata) => {
    await logAuditEvent({
      db,
      action: AUDIT_ACTIONS.ACADEMICS_UPDATED,
      module: "academics",
      targetId,
      performedBy,
      metadata,
    }).catch(() => {});
  };

  const handleCreateDepartment = async (event) => {
    event.preventDefault();
    if (busyKey) return;
    const name = toSafeText(departmentForm.name);
    const code = toSafeText(departmentForm.code).toUpperCase();

    if (!name || !code) {
      setStatusMessage("Department name and code are required.");
      return;
    }

    setBusyKey("create-department");
    setStatusMessage("");

    try {
      const ref = await addDoc(collection(db, "departments"), {
        name,
        code,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });
      await logAcademicChange(ref.id, { type: "department_created", name, code });
      setDepartmentForm({ name: "", code: "" });
      setStatusMessage("Department created.");
    } catch {
      setStatusMessage("Unable to create department.");
    } finally {
      setBusyKey("");
    }
  };

  const handleCreateClass = async (event) => {
    event.preventDefault();
    if (busyKey) return;
    const name = toSafeText(classForm.name);
    const departmentId = toSafeText(classForm.departmentId);
    const semester = toSafeText(classForm.semester);

    if (!name || !departmentId || !semester) {
      setStatusMessage("Class name, department, and semester are required.");
      return;
    }

    setBusyKey("create-class");
    setStatusMessage("");
    try {
      const ref = await addDoc(collection(db, "classes"), {
        name,
        departmentId,
        semester,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAcademicChange(ref.id, {
        type: "class_created",
        name,
        departmentId,
        semester,
      });
      setClassForm({ name: "", departmentId: "", semester: "" });
      setStatusMessage("Class created.");
    } catch {
      setStatusMessage("Unable to create class.");
    } finally {
      setBusyKey("");
    }
  };

  const handleCreateSubject = async (event) => {
    event.preventDefault();
    if (busyKey) return;
    const name = toSafeText(subjectForm.name);
    const code = toSafeText(subjectForm.code).toUpperCase();
    const departmentId = toSafeText(subjectForm.departmentId);
    const staffId = toSafeText(subjectForm.staffId);

    if (!name || !code || !departmentId || !staffId) {
      setStatusMessage("Subject name, code, department, and staff are required.");
      return;
    }

    setBusyKey("create-subject");
    setStatusMessage("");

    try {
      const staff = staffById.get(staffId);
      const ref = await addDoc(collection(db, "subjects"), {
        name,
        code,
        departmentId,
        assignedStaffId: staffId,
        assignedStaffName: staff?.name || staff?.email || "Staff",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAcademicChange(ref.id, {
        type: "subject_created",
        name,
        code,
        departmentId,
        staffId,
      });
      setSubjectForm({ name: "", code: "", departmentId: "", staffId: "" });
      setStatusMessage("Subject created and staff assigned.");
    } catch {
      setStatusMessage("Unable to create subject.");
    } finally {
      setBusyKey("");
    }
  };

  const handleAssignSubjectStaff = async (subjectId, staffId) => {
    if (!subjectId || !staffId || busyKey) return;
    setBusyKey(`subject-${subjectId}`);
    setStatusMessage("");
    try {
      const staff = staffById.get(staffId);
      await updateDoc(doc(db, "subjects", subjectId), {
        assignedStaffId: staffId,
        assignedStaffName: staff?.name || staff?.email || "Staff",
        updatedAt: serverTimestamp(),
      });
      await logAcademicChange(subjectId, {
        type: "subject_staff_assigned",
        staffId,
      });
      setStatusMessage("Subject staff assignment updated.");
    } catch {
      setStatusMessage("Unable to update subject assignment.");
    } finally {
      setBusyKey("");
    }
  };

  const handleAssignStudentClass = async (event) => {
    event.preventDefault();
    if (busyKey) return;
    const studentId = toSafeText(assignmentForm.studentId);
    const classId = toSafeText(assignmentForm.classId);
    const semester = toSafeText(assignmentForm.semester);
    if (!studentId || !classId || !semester) {
      setStatusMessage("Student, class, and semester are required.");
      return;
    }

    setBusyKey("assign-student");
    setStatusMessage("");
    try {
      const selectedClass = (classesState.data || []).find((item) => item.id === classId);
      await updateDoc(doc(db, "users", studentId), {
        classId,
        semester,
        departmentKey: toSafeText(
          departmentById.get(selectedClass?.departmentId)?.code
        ).toLowerCase(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "classes", classId), {
        studentIds: arrayUnion(studentId),
        updatedAt: serverTimestamp(),
      });
      await logAcademicChange(studentId, {
        type: "student_assigned_class",
        classId,
        semester,
      });
      setAssignmentForm({ studentId: "", classId: "", semester: "" });
      setStatusMessage("Student assigned to class and semester.");
    } catch {
      setStatusMessage("Unable to assign student.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Academic Control
        </p>
        <h2 className="text-2xl font-bold text-slate-900">
          Departments, Subjects, Classes
        </h2>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <form
          onSubmit={handleCreateDepartment}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">Create Department</h3>
          <div className="mt-3 grid gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Department name"
              value={departmentForm.name}
              onChange={(event) =>
                setDepartmentForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Code (e.g. AIDS)"
              value={departmentForm.code}
              onChange={(event) =>
                setDepartmentForm((prev) => ({ ...prev, code: event.target.value }))
              }
            />
            <button
              type="submit"
              disabled={busyKey === "create-department"}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add Department
            </button>
          </div>
        </form>

        <form
          onSubmit={handleCreateClass}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">Create Class</h3>
          <div className="mt-3 grid gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Class name"
              value={classForm.name}
              onChange={(event) =>
                setClassForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={classForm.departmentId}
              onChange={(event) =>
                setClassForm((prev) => ({
                  ...prev,
                  departmentId: event.target.value,
                }))
              }
            >
              <option value="">Select department</option>
              {(departmentsState.data || []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name} ({department.code})
                </option>
              ))}
            </select>
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Semester (e.g. 5)"
              value={classForm.semester}
              onChange={(event) =>
                setClassForm((prev) => ({ ...prev, semester: event.target.value }))
              }
            />
            <button
              type="submit"
              disabled={busyKey === "create-class"}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add Class
            </button>
          </div>
        </form>

        <form
          onSubmit={handleCreateSubject}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-slate-900">Create Subject</h3>
          <div className="mt-3 grid gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Subject name"
              value={subjectForm.name}
              onChange={(event) =>
                setSubjectForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Code (e.g. MA301)"
              value={subjectForm.code}
              onChange={(event) =>
                setSubjectForm((prev) => ({ ...prev, code: event.target.value }))
              }
            />
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={subjectForm.departmentId}
              onChange={(event) =>
                setSubjectForm((prev) => ({
                  ...prev,
                  departmentId: event.target.value,
                }))
              }
            >
              <option value="">Select department</option>
              {(departmentsState.data || []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={subjectForm.staffId}
              onChange={(event) =>
                setSubjectForm((prev) => ({ ...prev, staffId: event.target.value }))
              }
            >
              <option value="">Assign staff</option>
              {staffUsers.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name || staff.email}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busyKey === "create-subject"}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add Subject
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Assign Students to Class / Semester
        </h3>
        <form className="mt-3 grid gap-2 md:grid-cols-4" onSubmit={handleAssignStudentClass}>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={assignmentForm.studentId}
            onChange={(event) =>
              setAssignmentForm((prev) => ({ ...prev, studentId: event.target.value }))
            }
          >
            <option value="">Select student</option>
            {studentUsers.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name || student.email}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={assignmentForm.classId}
            onChange={(event) =>
              setAssignmentForm((prev) => ({ ...prev, classId: event.target.value }))
            }
          >
            <option value="">Select class</option>
            {(classesState.data || []).map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name} (Sem {classItem.semester})
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Semester"
            value={assignmentForm.semester}
            onChange={(event) =>
              setAssignmentForm((prev) => ({ ...prev, semester: event.target.value }))
            }
          />
          <button
            type="submit"
            disabled={busyKey === "assign-student"}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Assign Student
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Subjects and Staff</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Code</th>
                <th className="px-2 py-2">Department</th>
                <th className="px-2 py-2">Assigned Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(subjectsState.data || []).map((subject) => (
                <tr key={subject.id}>
                  <td className="px-2 py-3 font-semibold text-slate-900">
                    {subject.name || "-"}
                  </td>
                  <td className="px-2 py-3 text-slate-600">{subject.code || "-"}</td>
                  <td className="px-2 py-3 text-slate-600">
                    {departmentById.get(subject.departmentId)?.name || "-"}
                  </td>
                  <td className="px-2 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={subject.assignedStaffId || ""}
                      disabled={busyKey === `subject-${subject.id}`}
                      onChange={(event) =>
                        handleAssignSubjectStaff(subject.id, event.target.value)
                      }
                    >
                      <option value="">Select staff</option>
                      {staffUsers.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name || staff.email}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {(subjectsState.data || []).length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-sm text-slate-500" colSpan={4}>
                    No subjects found.
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
