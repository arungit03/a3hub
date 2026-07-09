import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "../lib/supabaseData";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  Droplet,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Mail,
  Phone,
  UserRound,
  Users,
} from "lucide-react";
import { db } from "../lib/supabase";
import { extractNumericQrValue } from "../lib/qr";
import { formatDateTime } from "../../shared/utils/format.js";
import { useAuth } from "../state/auth";

const ROW_ICONS = {
  "Roll No": GraduationCap,
  "Email": Mail,
  "Email ID": Mail,
  "Department": Building2,
  "Designation": Briefcase,
  "Student's Mobile Number": Phone,
  "Blood Group": Droplet,
  "Father's Name": Users,
  "Mother's Name": Users,
  "Father or Mother Mobile Number": Phone,
};

const EMPTY_VALUE = "-";

const toDisplayValue = (value, fallback = EMPTY_VALUE) => {
  if (value === 0) return "0";
  if (!value) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  return String(value);
};

const toInputValue = (value) => {
  if (value === 0) return "0";
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const pickFirstValue = (...values) => {
  for (const value of values) {
    const normalized = toInputValue(value);
    if (normalized) return normalized;
  }
  return "";
};

const normalizeDepartment = (value) =>
  (value || "").trim().toLowerCase();

const cleanDisplayText = (value) =>
  toInputValue(value).replace(/\s+/g, " ").trim();

const formatDepartmentLabel = (value) => {
  const cleaned = cleanDisplayText(value);
  if (!cleaned) return EMPTY_VALUE;
  if (cleaned === cleaned.toLowerCase()) return cleaned.toUpperCase();
  return cleaned;
};

const formatDesignationLabel = (value) => {
  const cleaned = cleanDisplayText(value);
  if (!cleaned) return EMPTY_VALUE;
  if (cleaned === cleaned.toLowerCase()) {
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return cleaned;
};

const splitParentNames = (value) => {
  const raw = toInputValue(value);
  if (!raw) {
    return { fatherName: "", motherName: "" };
  }

  const separators = ["&", "/", ",", "|"];
  for (const separator of separators) {
    if (!raw.includes(separator)) continue;
    const [first, second] = raw.split(separator);
    return {
      fatherName: toInputValue(first),
      motherName: toInputValue(second),
    };
  }

  return { fatherName: raw, motherName: "" };
};

const buildStudentDetails = (value, fallback = {}) => {
  const nestedDetails =
    value?.studentDetails && typeof value.studentDetails === "object"
      ? value.studentDetails
      : {};
  const parentNameFallback = splitParentNames(
    pickFirstValue(
      nestedDetails.parentNames,
      nestedDetails.parentName,
      nestedDetails.fatherMotherName,
      value?.parentNames,
      value?.parentName,
      value?.fatherMotherName
    )
  );

  return {
    rollNo: pickFirstValue(
      nestedDetails.rollNo,
      nestedDetails.rollNO,
      nestedDetails.roll_no,
      nestedDetails.registerNumber,
      nestedDetails.registerNo,
      nestedDetails.registrationNo,
      value?.rollNo,
      value?.rollNO,
      value?.roll_no,
      value?.registerNumber,
      value?.registerNo,
      value?.registrationNo,
      value?.studentRollNo
    ),
    department: pickFirstValue(
      nestedDetails.department,
      nestedDetails.departmentName,
      nestedDetails.dept,
      value?.department,
      value?.departmentName,
      value?.dept
    ),
    email: pickFirstValue(
      nestedDetails.email,
      nestedDetails.emailId,
      nestedDetails.emailID,
      nestedDetails.studentEmail,
      value?.email,
      value?.emailId,
      value?.emailID,
      value?.studentEmail,
      fallback?.email
    ),
    studentMobile: pickFirstValue(
      nestedDetails.studentMobile,
      nestedDetails.studentMobileNumber,
      nestedDetails.mobile,
      nestedDetails.phone,
      nestedDetails.phoneNumber,
      nestedDetails.studentPhone,
      nestedDetails.whatsapp,
      value?.studentMobile,
      value?.studentMobileNumber,
      value?.mobile,
      value?.phone,
      value?.phoneNumber,
      value?.studentPhone,
      value?.whatsapp,
      fallback?.studentMobile
    ),
    bloodGroup: pickFirstValue(
      nestedDetails.bloodGroup,
      nestedDetails.blood_group,
      value?.bloodGroup,
      value?.blood_group
    ),
    fatherName: pickFirstValue(
      nestedDetails.fatherName,
      nestedDetails.fathersName,
      value?.fatherName,
      value?.fathersName,
      parentNameFallback.fatherName
    ),
    motherName: pickFirstValue(
      nestedDetails.motherName,
      nestedDetails.mothersName,
      value?.motherName,
      value?.mothersName,
      parentNameFallback.motherName
    ),
    parentMobile: pickFirstValue(
      nestedDetails.parentMobile,
      nestedDetails.parentMobileNumber,
      nestedDetails.parentPhone,
      nestedDetails.guardianMobile,
      nestedDetails.fatherMobile,
      nestedDetails.motherMobile,
      value?.parentMobile,
      value?.parentMobileNumber,
      value?.parentPhone,
      value?.guardianMobile,
      value?.fatherMobile,
      value?.motherMobile
    ),
  };
};

export default function ProfilePage({ forcedRole }) {
  const { user, profile, role: contextRole, logout, resetPassword } = useAuth();
  const role = forcedRole || contextRole;

  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const accountEmail =
    typeof user?.email === "string"
      ? user.email.trim()
      : typeof profile?.email === "string"
        ? profile.email.trim()
        : "";
  const [studentDetails, setStudentDetails] = useState(() =>
    buildStudentDetails(profile, { email: accountEmail })
  );
  const [studentDetailsForm, setStudentDetailsForm] = useState(() =>
    buildStudentDetails(profile, { email: accountEmail })
  );
  const [isStudentDetailsModalOpen, setIsStudentDetailsModalOpen] =
    useState(false);
  const [isStudentDetailsEditMode, setIsStudentDetailsEditMode] = useState(false);
  const [isSavingStudentDetails, setIsSavingStudentDetails] = useState(false);
  const [studentDetailsStatus, setStudentDetailsStatus] = useState("");
  const [studentDetailsError, setStudentDetailsError] = useState("");
  const [liveProfileData, setLiveProfileData] = useState(null);
  const [isStaffDetailsModalOpen, setIsStaffDetailsModalOpen] = useState(false);

  const profileData = (liveProfileData && typeof liveProfileData === "object"
    ? liveProfileData
    : profile) || {};

  const name = toDisplayValue(
    pickFirstValue(profileData?.name, profile?.name, user?.displayName),
    "Campus Member"
  );
  const email = toDisplayValue(
    role === "student"
      ? studentDetails.email || accountEmail
      : pickFirstValue(profileData?.email, accountEmail)
  );
  const staffDepartment = formatDepartmentLabel(
    pickFirstValue(
      profileData?.department,
      profileData?.departmentName,
      profileData?.dept,
      profileData?.departmentKey
    )
  );
  const department = toDisplayValue(
    role === "student" ? studentDetails.department : staffDepartment
  );
  const year =
    profile?.year === 0 || profile?.year ? String(profile.year) : EMPTY_VALUE;
  const rollNo = toDisplayValue(
    role === "student" ? studentDetails.rollNo : profile?.rollNo || profile?.registerNumber
  );
  const designation = toDisplayValue(
    formatDesignationLabel(
      pickFirstValue(
        profileData?.designation,
        profileData?.title,
        profileData?.jobTitle
      )
    )
  );
  const subtitle =
    role === "staff"
      ? designation !== EMPTY_VALUE
        ? designation
        : "Staff Member"
      : rollNo !== EMPTY_VALUE
        ? rollNo
        : email;

  const profileRows =
    role === "staff"
      ? [
          { label: "Email", value: email, mono: true },
          { label: "Department", value: department },
          { label: "Designation", value: designation },
        ]
      : [
          { label: "Roll No", value: toDisplayValue(studentDetails.rollNo) },
          {
            label: "Department",
            value: toDisplayValue(studentDetails.department),
          },
          {
            label: "Email ID",
            value: toDisplayValue(studentDetails.email || accountEmail),
            mono: true,
          },
          {
            label: "Student's Mobile Number",
            value: toDisplayValue(studentDetails.studentMobile),
          },
          { label: "Blood Group", value: toDisplayValue(studentDetails.bloodGroup) },
          {
            label: "Father's Name",
            value: toDisplayValue(studentDetails.fatherName),
          },
          {
            label: "Mother's Name",
            value: toDisplayValue(studentDetails.motherName),
          },
          {
            label: "Father or Mother Mobile Number",
            value: toDisplayValue(studentDetails.parentMobile),
          },
        ];

  useEffect(() => {
    if (role !== "student") return;
    const nextDetails = buildStudentDetails(profile, { email: accountEmail });
    setStudentDetails(nextDetails);
    setStudentDetailsForm(nextDetails);
  }, [role, profile, accountEmail]);

  useEffect(() => {
    if (!user?.uid) {
      setLiveProfileData(null);
      return undefined;
    }

    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setLiveProfileData(null);
          return;
        }

        const snapshotData = snapshot.data() || {};
        setLiveProfileData(snapshotData);

        if (role !== "student") return;

        const nextDetails = buildStudentDetails(snapshotData, {
          email: accountEmail,
        });
        setStudentDetails(nextDetails);
        if (!isStudentDetailsEditMode && !isSavingStudentDetails) {
          setStudentDetailsForm(nextDetails);
        }
      },
      () => {
        // Non-blocking: keep local state from auth context if realtime read fails.
      }
    );

    return () => unsubscribe();
  }, [
    role,
    user?.uid,
    accountEmail,
    isStudentDetailsEditMode,
    isSavingStudentDetails,
  ]);

  const handlePasswordChange = async () => {
    setResetError("");
    setResetMessage("");

    if (!accountEmail) {
      setResetError("No email is linked to this account.");
      return;
    }

    setIsSendingReset(true);
    try {
      await resetPassword(accountEmail);
      setResetMessage(
        "Password reset security email sent. Check Primary inbox. If it is in Spam, mark Not spam."
      );
    } catch (error) {
      setResetError(
        error?.message || "Unable to send password reset email right now."
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleOpenStudentDetailsModal = () => {
    if (role !== "student") return;
    setStudentDetailsError("");
    setStudentDetailsStatus("");
    setStudentDetailsForm(studentDetails);
    setIsStudentDetailsEditMode(false);
    setIsStudentDetailsModalOpen(true);
  };

  const handleCloseStudentDetailsModal = () => {
    if (isSavingStudentDetails) return;
    setIsStudentDetailsEditMode(false);
    setIsStudentDetailsModalOpen(false);
  };

  const handleStartStudentDetailsEdit = () => {
    setStudentDetailsError("");
    setStudentDetailsStatus("");
    setStudentDetailsForm(studentDetails);
    setIsStudentDetailsEditMode(true);
  };

  const handleCancelStudentDetailsEdit = () => {
    if (isSavingStudentDetails) return;
    setStudentDetailsError("");
    setStudentDetailsForm(studentDetails);
    setIsStudentDetailsEditMode(false);
  };

  const handleChangeStudentDetail = (field, value) => {
    setStudentDetailsForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setStudentDetailsError("");
    setStudentDetailsStatus("");
  };

  const handleSaveStudentDetails = async (event) => {
    event.preventDefault();
    if (role !== "student" || !user?.uid || isSavingStudentDetails) return;

    const nextDetails = {
      rollNo: toInputValue(studentDetailsForm.rollNo),
      department: toInputValue(studentDetailsForm.department),
      email: toInputValue(studentDetailsForm.email),
      studentMobile: toInputValue(studentDetailsForm.studentMobile),
      bloodGroup: toInputValue(studentDetailsForm.bloodGroup),
      fatherName: toInputValue(studentDetailsForm.fatherName),
      motherName: toInputValue(studentDetailsForm.motherName),
      parentMobile: toInputValue(studentDetailsForm.parentMobile),
    };

    if (
      nextDetails.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextDetails.email)
    ) {
      setStudentDetailsError("Enter a valid email address.");
      return;
    }

    setIsSavingStudentDetails(true);
    setStudentDetailsError("");
    setStudentDetailsStatus("");
    const rollNoNumber = extractNumericQrValue(nextDetails.rollNo);

    const payload = {
      rollNo: nextDetails.rollNo,
      registerNumber: nextDetails.rollNo,
      rollNoNumber: Number.isSafeInteger(rollNoNumber) ? rollNoNumber : null,
      department: nextDetails.department,
      departmentKey: normalizeDepartment(nextDetails.department),
      email: nextDetails.email,
      studentMobile: nextDetails.studentMobile,
      mobile: nextDetails.studentMobile,
      bloodGroup: nextDetails.bloodGroup,
      fatherName: nextDetails.fatherName,
      motherName: nextDetails.motherName,
      parentNames: [nextDetails.fatherName, nextDetails.motherName]
        .filter(Boolean)
        .join(" / "),
      parentMobile: nextDetails.parentMobile,
    };

    const userRef = doc(db, "users", user.uid);
    try {
      try {
        await updateDoc(userRef, payload);
      } catch {
        await setDoc(userRef, payload, { merge: true });
      }
      setStudentDetails(nextDetails);
      setStudentDetailsForm(nextDetails);
      setStudentDetailsStatus("Student details saved.");
      setIsStudentDetailsEditMode(false);
    } catch {
      setStudentDetailsError("Unable to save student details right now.");
    } finally {
      setIsSavingStudentDetails(false);
    }
  };

  const studentName = name || "Campus Member";
  const studentDepartment =
    department !== EMPTY_VALUE ? department : "Department";
  const studentYearLabel = year !== EMPTY_VALUE ? `Year ${year}` : "Year -";
  const studentIdLabel = rollNo !== EMPTY_VALUE ? rollNo : "Not Available";
  const staffName = name || "Campus Member";
  const staffDepartmentLabel =
    department !== EMPTY_VALUE ? department : "Department";
  const staffDesignationLabel =
    designation !== EMPTY_VALUE ? designation : "Designation";
  const staffIdentityLabel = rollNo !== EMPTY_VALUE ? "Staff ID:" : "Designation:";
  const staffIdentityValue =
    rollNo !== EMPTY_VALUE ? rollNo : subtitle || "Staff Member";
  const accountRoleLabel = role ? formatDesignationLabel(role) : "Account";
  const isEmailVerified = Boolean(user?.emailVerified);
  const memberSinceLabel = profileData?.createdAt
    ? formatDateTime(profileData.createdAt)
    : null;

  if (role === "student") {
    return (
      <>
        <section className="relative overflow-hidden rounded-3xl border border-clay/24 bg-white/60 px-5 py-4 shadow-soft backdrop-blur-xl">
          <div
            className="absolute inset-0 bg-linear-to-r from-ocean/10 via-aurora/8 to-transparent"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-3">
            <p className="text-lg font-semibold uppercase tracking-[0.1em] text-ocean sm:text-xl">
              Campus Hub
            </p>
            <span className="inline-flex items-center rounded-xl bg-linear-to-r from-ocean to-aurora px-4 py-1.5 text-sm font-semibold text-white shadow-sm sm:text-base">
              Student
            </span>
          </div>
        </section>

        <section className="relative mt-4 overflow-hidden rounded-3xl border border-clay/24 bg-white/70 p-5 shadow-soft backdrop-blur-xl sm:p-8">
          <div
            className="absolute inset-0 bg-linear-to-br from-white/40 via-ocean/8 to-aurora/10"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative w-fit">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-ocean to-aurora text-white shadow-float sm:h-24 sm:w-24">
                <UserRound size={42} strokeWidth={2.1} />
              </div>
              <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-[3px] border-white bg-emerald-500 shadow-sm" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-bold text-ink sm:text-3xl">
                  {studentName}
                </h2>
                <span className="rounded-xl border border-ocean/30 bg-ocean/10 px-2.5 py-0.5 text-xs font-semibold text-ocean sm:px-3 sm:py-1">
                  {studentDepartment}
                </span>
                <span className="rounded-xl border border-aurora/35 bg-aurora/12 px-2.5 py-0.5 text-xs font-semibold text-cocoa sm:px-3 sm:py-1">
                  {studentYearLabel}
                </span>
                {isEmailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-300/55 bg-emerald-100/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 sm:px-3 sm:py-1">
                    <BadgeCheck size={13} strokeWidth={2.3} />
                    Verified
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-base text-ink/65 sm:text-xl">
                <span className="font-medium text-ink/55">Student ID:</span>{" "}
                <span className="font-semibold text-ink">{studentIdLabel}</span>
              </p>
              {memberSinceLabel ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink/45 sm:text-sm">
                  <CalendarDays size={14} strokeWidth={2} />
                  Member since {memberSinceLabel}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={handleOpenStudentDetailsModal}
          className="group relative mt-4 w-full overflow-hidden rounded-3xl border border-ocean/45 bg-linear-to-r from-ocean via-ocean to-aurora px-4 py-5 text-center text-xl font-semibold text-white shadow-float transition hover:brightness-105 sm:py-6 sm:text-2xl"
        >
          <span
            className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
          />
          <span className="relative inline-flex items-center">
            Student&apos;s Details
          </span>
        </button>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handlePasswordChange}
            disabled={isSendingReset || !accountEmail}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-clay/24 bg-white/70 px-4 py-4 text-lg font-semibold text-ink shadow-soft backdrop-blur-md transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[70px] sm:text-xl"
          >
            <LockKeyhole size={20} strokeWidth={2} />
            {isSendingReset ? "Sending reset link..." : "Change Password"}
          </button>

          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-aurora/45 bg-linear-to-r from-ocean to-aurora px-4 py-4 text-lg font-semibold text-white shadow-float transition-transform hover:-translate-y-0.5 sm:min-h-[70px] sm:text-xl"
          >
            <LogOut size={20} strokeWidth={2} />
            Logout
          </button>
        </div>

        {resetError ? (
          <p
            className="mt-3 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs font-semibold text-red-700"
            aria-live="polite"
          >
            {resetError}
          </p>
        ) : null}
        {resetMessage ? (
          <p
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-700"
            aria-live="polite"
          >
            {resetMessage}
          </p>
        ) : null}

        {isStudentDetailsModalOpen ? (
          <div
            className="ui-modal ui-modal--compact"
            role="dialog"
            aria-modal="true"
            aria-label="Student details"
          >
            <button
              type="button"
              onClick={handleCloseStudentDetailsModal}
              aria-label="Close student details editor"
              className="ui-modal__scrim"
              tabIndex={-1}
            />
            <div tabIndex={-1} className="ui-modal__panel w-full max-w-xl">
              <div className="ui-modal__body pb-[calc(11rem+env(safe-area-inset-bottom))]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                      Student&apos;s Details
                    </p>
                    <h3 className="text-xl font-semibold text-ink">
                      {isStudentDetailsEditMode ? "Edit Details" : "View Details"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseStudentDetailsModal}
                    className="ui-modal__close"
                    disabled={isSavingStudentDetails}
                  >
                    Close
                  </button>
                </div>

                {isStudentDetailsEditMode ? (
                  <form className="mt-4 grid gap-3" onSubmit={handleSaveStudentDetails}>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Roll No
                      </span>
                      <input
                        type="text"
                        value={studentDetailsForm.rollNo}
                        onChange={(event) =>
                          handleChangeStudentDetail("rollNo", event.target.value)
                        }
                        placeholder="Enter roll number"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Department
                      </span>
                      <input
                        type="text"
                        value={studentDetailsForm.department}
                        onChange={(event) =>
                          handleChangeStudentDetail("department", event.target.value)
                        }
                        placeholder="Enter department"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Email ID
                      </span>
                      <input
                        type="email"
                        value={studentDetailsForm.email}
                        onChange={(event) =>
                          handleChangeStudentDetail("email", event.target.value)
                        }
                        placeholder="Enter email address"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Student&apos;s Mobile Number
                      </span>
                      <input
                        type="tel"
                        value={studentDetailsForm.studentMobile}
                        onChange={(event) =>
                          handleChangeStudentDetail("studentMobile", event.target.value)
                        }
                        placeholder="Enter student mobile number"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Blood Group
                      </span>
                      <input
                        type="text"
                        value={studentDetailsForm.bloodGroup}
                        onChange={(event) =>
                          handleChangeStudentDetail("bloodGroup", event.target.value)
                        }
                        placeholder="Enter blood group"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Father&apos;s Name
                      </span>
                      <input
                        type="text"
                        value={studentDetailsForm.fatherName}
                        onChange={(event) =>
                          handleChangeStudentDetail("fatherName", event.target.value)
                        }
                        placeholder="Enter father's name"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Mother&apos;s Name
                      </span>
                      <input
                        type="text"
                        value={studentDetailsForm.motherName}
                        onChange={(event) =>
                          handleChangeStudentDetail("motherName", event.target.value)
                        }
                        placeholder="Enter mother's name"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
                        Father or Mother Mobile Number
                      </span>
                      <input
                        type="tel"
                        value={studentDetailsForm.parentMobile}
                        onChange={(event) =>
                          handleChangeStudentDetail("parentMobile", event.target.value)
                        }
                        placeholder="Enter parent mobile number"
                        className="mt-1 w-full rounded-xl border border-clay/30 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
                      />
                    </label>

                    {studentDetailsError ? (
                      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                        {studentDetailsError}
                      </p>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleCancelStudentDetailsEdit}
                        disabled={isSavingStudentDetails}
                        className="w-full rounded-xl border border-clay/25 bg-white px-4 py-2 text-sm font-semibold text-ink/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingStudentDetails}
                        className="w-full rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-ink shadow disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingStudentDetails ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-4">
                    <dl className="divide-y divide-clay/20">
                      {profileRows.map((row) => {
                        const RowIcon = ROW_ICONS[row.label];
                        return (
                          <div
                            key={row.label}
                            className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[144px_minmax(0,1fr)] sm:items-center sm:gap-3"
                          >
                            <dt className="flex items-center gap-2 text-sm text-ink/70">
                              {RowIcon ? (
                                <RowIcon size={15} strokeWidth={2} className="text-ocean/70" />
                              ) : null}
                              {row.label}
                            </dt>
                            <dd
                              className={`break-words text-left text-sm font-semibold leading-tight text-ink sm:text-right ${row.mono ? "break-all font-mono text-[13px] sm:text-sm" : ""}`}
                            >
                              {row.value}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                    {studentDetailsStatus ? (
                      <p className="mt-3 rounded-xl border border-ink/10 bg-sand/80 px-3 py-2 text-xs font-medium text-ink/80">
                        {studentDetailsStatus}
                      </p>
                    ) : null}
                    {studentDetailsError ? (
                      <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                        {studentDetailsError}
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleCloseStudentDetailsModal}
                        className="w-full rounded-xl border border-clay/25 bg-white px-4 py-2 text-sm font-semibold text-ink/80"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleStartStudentDetailsEdit}
                        className="w-full rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-ink shadow"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-clay/24 bg-white/60 px-5 py-4 shadow-soft backdrop-blur-xl">
        <div
          className="absolute inset-0 bg-linear-to-r from-ocean/10 via-aurora/8 to-transparent"
          aria-hidden="true"
        />
        <div className="relative flex items-center justify-between gap-3">
          <p className="text-lg font-semibold uppercase tracking-[0.1em] text-ocean sm:text-xl">
            Campus Hub
          </p>
          <span className="inline-flex items-center rounded-xl bg-linear-to-r from-ocean to-aurora px-4 py-1.5 text-sm font-semibold text-white shadow-sm sm:text-base">
            {accountRoleLabel}
          </span>
        </div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-3xl border border-clay/24 bg-white/70 p-5 shadow-soft backdrop-blur-xl sm:p-8">
        <div
          className="absolute inset-0 bg-linear-to-br from-white/40 via-ocean/8 to-aurora/10"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-ocean to-aurora text-white shadow-float sm:h-24 sm:w-24">
              <UserRound size={42} strokeWidth={2.1} />
            </div>
            <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-[3px] border-white bg-emerald-500 shadow-sm" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-bold text-ink sm:text-3xl">
                {staffName}
              </h2>
              <span className="rounded-xl border border-ocean/30 bg-ocean/10 px-2.5 py-0.5 text-xs font-semibold text-ocean sm:px-3 sm:py-1">
                {staffDepartmentLabel}
              </span>
              <span className="rounded-xl border border-aurora/35 bg-aurora/12 px-2.5 py-0.5 text-xs font-semibold text-cocoa sm:px-3 sm:py-1">
                {staffDesignationLabel}
              </span>
              {isEmailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-300/55 bg-emerald-100/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 sm:px-3 sm:py-1">
                  <BadgeCheck size={13} strokeWidth={2.3} />
                  Verified
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-base text-ink/65 sm:text-xl">
              <span className="font-medium text-ink/55">{staffIdentityLabel}</span>{" "}
              <span className="font-semibold text-ink">{staffIdentityValue}</span>
            </p>
            {memberSinceLabel ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink/45 sm:text-sm">
                <CalendarDays size={14} strokeWidth={2} />
                Member since {memberSinceLabel}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setIsStaffDetailsModalOpen(true)}
        className="group relative mt-4 w-full overflow-hidden rounded-3xl border border-ocean/45 bg-linear-to-r from-ocean via-ocean to-aurora px-4 py-5 text-center text-xl font-semibold text-white shadow-float transition hover:brightness-105 sm:py-6 sm:text-2xl"
      >
        <span
          className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden="true"
        />
        <span className="relative inline-flex items-center">
          {accountRoleLabel}&apos;s Details
        </span>
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handlePasswordChange}
          disabled={isSendingReset || !accountEmail}
          className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-clay/24 bg-white/70 px-4 py-4 text-lg font-semibold text-ink shadow-soft backdrop-blur-md transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[70px] sm:text-xl"
        >
          <LockKeyhole size={20} strokeWidth={2} />
          {isSendingReset ? "Sending reset link..." : "Change Password"}
        </button>

        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-aurora/45 bg-linear-to-r from-ocean to-aurora px-4 py-4 text-lg font-semibold text-white shadow-float transition-transform hover:-translate-y-0.5 sm:min-h-[70px] sm:text-xl"
        >
          <LogOut size={20} strokeWidth={2} />
          Logout
        </button>
      </div>

      {resetError ? (
        <p
          className="mt-3 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs font-semibold text-red-700"
          aria-live="polite"
        >
          {resetError}
        </p>
      ) : null}
      {resetMessage ? (
        <p
          className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-700"
          aria-live="polite"
        >
          {resetMessage}
        </p>
      ) : null}

      {isStaffDetailsModalOpen ? (
        <div
          className="ui-modal ui-modal--compact"
          role="dialog"
          aria-modal="true"
          aria-label="Account details"
        >
          <button
            type="button"
            onClick={() => setIsStaffDetailsModalOpen(false)}
            aria-label="Close account details"
            className="ui-modal__scrim"
            tabIndex={-1}
          />
          <div tabIndex={-1} className="ui-modal__panel w-full max-w-xl">
            <div className="ui-modal__body pb-[calc(11rem+env(safe-area-inset-bottom))]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/75">
                    {accountRoleLabel}&apos;s Details
                  </p>
                  <h3 className="text-xl font-semibold text-ink">Account Details</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsStaffDetailsModalOpen(false)}
                  className="ui-modal__close"
                >
                  Close
                </button>
              </div>

              <div className="mt-4">
                <dl className="divide-y divide-clay/20">
                  {profileRows.map((row) => {
                    const RowIcon = ROW_ICONS[row.label];
                    return (
                      <div
                        key={row.label}
                        className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[144px_minmax(0,1fr)] sm:items-center sm:gap-3"
                      >
                        <dt className="flex items-center gap-2 text-sm text-ink/70">
                          {RowIcon ? (
                            <RowIcon size={15} strokeWidth={2} className="text-ocean/70" />
                          ) : null}
                          {row.label}
                        </dt>
                        <dd
                          className={`break-words text-left text-sm font-semibold leading-tight text-ink sm:text-right ${row.mono ? "break-all font-mono text-[13px] sm:text-sm" : ""}`}
                        >
                          {row.value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
