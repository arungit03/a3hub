import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  CalendarDays,
  Code2,
  Flame,
  LogOut,
  LockKeyhole,
  Medal,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { db } from "../lib/firebase";
import { extractNumericQrValue } from "../lib/qr";
import { useAuth } from "../state/auth";

const EMPTY_VALUE = "-";
const DAILY_PYTHON_PROGRESS_COLLECTION = "dailyPythonProgress";

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
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
  const [dailyStatsError, setDailyStatsError] = useState("");
  const [dailyStats, setDailyStats] = useState({
    solvedToday: 0,
    dailyStreak: 0,
    bestStreak: 0,
    totalSolved: 0,
    activeDays: 0,
  });
  const [liveProfileData, setLiveProfileData] = useState(null);

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

  useEffect(() => {
    if (role !== "student" || !user?.uid) {
      setDailyStatsLoading(false);
      setDailyStatsError("");
      setDailyStats({
        solvedToday: 0,
        dailyStreak: 0,
        bestStreak: 0,
        totalSolved: 0,
        activeDays: 0,
      });
      return undefined;
    }

    setDailyStatsLoading(true);
    setDailyStatsError("");

    const progressRef = doc(db, DAILY_PYTHON_PROGRESS_COLLECTION, user.uid);
    const unsubscribe = onSnapshot(
      progressRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setDailyStats({
            solvedToday: 0,
            dailyStreak: 0,
            bestStreak: 0,
            totalSolved: 0,
            activeDays: 0,
          });
          setDailyStatsLoading(false);
          return;
        }

        const data = snapshot.data();
        setDailyStats({
          solvedToday: Number(data?.solvedCount || 0),
          dailyStreak: Number(data?.dailyStreak || 0),
          bestStreak: Number(data?.bestStreak || 0),
          totalSolved: Number(data?.totalSolvedChallenges || 0),
          activeDays: Number(data?.daysParticipated || 0),
        });
        setDailyStatsLoading(false);
      },
      () => {
        setDailyStatsLoading(false);
        setDailyStatsError("Unable to load challenge stats right now.");
      }
    );

    return () => unsubscribe();
  }, [role, user?.uid]);

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
  const solvedTodayTarget = 3;
  const solvedTodayProgress = Math.min(
    Math.max((dailyStats.solvedToday / solvedTodayTarget) * 100, 0),
    100
  );
  const staffName = name || "Campus Member";
  const staffDepartmentLabel =
    department !== EMPTY_VALUE ? department : "Department";
  const staffDesignationLabel =
    designation !== EMPTY_VALUE ? designation : "Designation";
  const staffIdentityLabel = rollNo !== EMPTY_VALUE ? "Staff ID:" : "Designation:";
  const staffIdentityValue =
    rollNo !== EMPTY_VALUE ? rollNo : subtitle || "Staff Member";
  const accountRoleLabel = role ? formatDesignationLabel(role) : "Account";

  if (role === "student") {
    return (
      <>
        <section className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/30 px-5 py-4 shadow-soft backdrop-blur-xl">
          <div
            className="absolute inset-0 bg-gradient-to-r from-blue-500/8 via-indigo-500/7 to-transparent"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-3">
            <p className="text-lg font-semibold uppercase tracking-[0.1em] text-blue-700 sm:text-xl">
              Campus Hub
            </p>
            <span className="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm sm:text-base">
              Student
            </span>
          </div>
        </section>

        <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/50 bg-white/38 p-5 shadow-soft backdrop-blur-xl sm:p-8">
          <div
            className="absolute inset-0 bg-gradient-to-br from-white/30 via-blue-100/24 to-indigo-200/14"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative w-fit">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-float sm:h-24 sm:w-24">
                <UserRound size={42} strokeWidth={2.1} />
              </div>
              <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-[3px] border-white bg-emerald-500 shadow-sm" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-bold text-slate-900 sm:text-3xl">
                  {studentName}
                </h2>
                <span className="rounded-xl border border-blue-300/55 bg-blue-100/48 px-2.5 py-0.5 text-xs font-semibold text-blue-700 sm:px-3 sm:py-1">
                  {studentDepartment}
                </span>
                <span className="rounded-xl border border-indigo-300/55 bg-indigo-100/48 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 sm:px-3 sm:py-1">
                  {studentYearLabel}
                </span>
              </div>
              <p className="mt-3 text-base text-slate-600 sm:text-xl">
                <span className="font-medium text-slate-500">Student ID:</span>{" "}
                <span className="font-semibold text-slate-800">{studentIdLabel}</span>
              </p>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={handleOpenStudentDetailsModal}
          className="group relative mt-4 w-full overflow-hidden rounded-3xl border border-blue-400/45 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 px-4 py-5 text-center text-xl font-semibold text-white shadow-float sm:py-6 sm:text-2xl"
        >
          <span
            className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
          />
          <span className="relative inline-flex items-center">
            Student&apos;s Details
          </span>
        </button>

        <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/50 bg-white/38 p-5 shadow-soft backdrop-blur-xl sm:p-6">
          <div
            className="absolute inset-0 bg-gradient-to-br from-white/28 via-blue-100/20 to-indigo-100/14"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
                <Code2 size={24} strokeWidth={2.2} />
              </span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Daily Python Progress
              </h3>
            </div>

            {dailyStatsLoading ? (
              <p className="mt-6 text-sm font-medium text-slate-600">
                Loading challenge stats...
              </p>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <article className="rounded-2xl border border-emerald-300/45 bg-gradient-to-br from-emerald-50/70 via-emerald-100/45 to-emerald-200/22 p-3 shadow-sm backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Solved Today
                    </p>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-400/35">
                      <Code2 size={15} strokeWidth={2} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold leading-none text-emerald-900 sm:text-3xl">
                    {dailyStats.solvedToday}/{solvedTodayTarget}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-200/70">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
                      style={{ width: `${solvedTodayProgress}%` }}
                    />
                  </div>
                </article>

                <article className="rounded-2xl border border-blue-300/45 bg-gradient-to-br from-blue-50/70 via-blue-100/45 to-blue-200/22 p-3 shadow-sm backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                      Current Streak
                    </p>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 ring-1 ring-blue-400/35">
                      <Flame size={15} strokeWidth={2} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold leading-none text-blue-900 sm:text-3xl">
                    {dailyStats.dailyStreak}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-blue-700/85">days</p>
                </article>

                <article className="rounded-2xl border border-amber-300/45 bg-gradient-to-br from-amber-50/70 via-amber-100/45 to-amber-200/22 p-3 shadow-sm backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                      Best Streak
                    </p>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 ring-1 ring-amber-400/35">
                      <Medal size={15} strokeWidth={2} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold leading-none text-amber-900 sm:text-3xl">
                    {dailyStats.bestStreak}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-amber-700/85">days</p>
                </article>

                <article className="rounded-2xl border border-purple-300/45 bg-gradient-to-br from-purple-50/70 via-purple-100/45 to-purple-200/22 p-3 shadow-sm backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-purple-700">
                      Total Solved
                    </p>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-700 ring-1 ring-purple-400/35">
                      <TrendingUp size={15} strokeWidth={2} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold leading-none text-purple-900 sm:text-3xl">
                    {dailyStats.totalSolved}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-purple-700/85">
                    problems
                  </p>
                </article>

                <article className="rounded-2xl border border-rose-300/45 bg-gradient-to-br from-rose-50/70 via-rose-100/45 to-rose-200/22 p-3 shadow-sm backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
                      Active Days
                    </p>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-700 ring-1 ring-rose-400/35">
                      <CalendarDays size={15} strokeWidth={2} />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold leading-none text-rose-900 sm:text-3xl">
                    {dailyStats.activeDays}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-rose-700/85">days</p>
                </article>
              </div>
            )}

            {dailyStatsError ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs font-semibold text-red-700">
                {dailyStatsError}
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handlePasswordChange}
            disabled={isSendingReset || !accountEmail}
            className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border border-slate-200/60 bg-white/58 px-4 py-4 text-lg font-semibold text-slate-800 shadow-soft backdrop-blur-md transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[70px] sm:text-xl"
          >
            <LockKeyhole size={20} strokeWidth={2} />
            {isSendingReset ? "Sending reset link..." : "Change Password"}
          </button>

          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border border-indigo-400/45 bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-4 text-lg font-semibold text-white shadow-float transition-transform hover:-translate-y-0.5 sm:min-h-[70px] sm:text-xl"
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
                      {profileRows.map((row) => (
                        <div
                          key={row.label}
                          className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[144px_minmax(0,1fr)] sm:items-center sm:gap-3"
                        >
                          <dt className="text-sm text-ink/70">{row.label}</dt>
                          <dd
                            className={`break-words text-left text-sm font-semibold leading-tight text-ink sm:text-right ${row.mono ? "break-all font-mono text-[13px] sm:text-sm" : ""}`}
                          >
                            {row.value}
                          </dd>
                        </div>
                      ))}
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
      <section className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/30 px-5 py-4 shadow-soft backdrop-blur-xl">
        <div
          className="absolute inset-0 bg-gradient-to-r from-blue-500/8 via-indigo-500/7 to-transparent"
          aria-hidden="true"
        />
        <div className="relative flex items-center justify-between gap-3">
          <p className="text-lg font-semibold uppercase tracking-[0.1em] text-blue-700 sm:text-xl">
            Campus Hub
          </p>
          <span className="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm sm:text-base">
            {accountRoleLabel}
          </span>
        </div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/50 bg-white/38 p-5 shadow-soft backdrop-blur-xl sm:p-8">
        <div
          className="absolute inset-0 bg-gradient-to-br from-white/30 via-blue-100/24 to-indigo-200/14"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-float sm:h-24 sm:w-24">
              <UserRound size={42} strokeWidth={2.1} />
            </div>
            <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-[3px] border-white bg-emerald-500 shadow-sm" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-bold text-slate-900 sm:text-3xl">
                {staffName}
              </h2>
              <span className="rounded-xl border border-blue-300/55 bg-blue-100/48 px-2.5 py-0.5 text-xs font-semibold text-blue-700 sm:px-3 sm:py-1">
                {staffDepartmentLabel}
              </span>
              <span className="rounded-xl border border-indigo-300/55 bg-indigo-100/48 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 sm:px-3 sm:py-1">
                {staffDesignationLabel}
              </span>
            </div>
            <p className="mt-3 text-base text-slate-600 sm:text-xl">
              <span className="font-medium text-slate-500">{staffIdentityLabel}</span>{" "}
              <span className="font-semibold text-slate-800">{staffIdentityValue}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-3xl border border-blue-400/45 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 px-4 py-5 text-center text-xl font-semibold text-white shadow-float sm:py-6 sm:text-2xl">
        <div
          className="absolute inset-0 bg-white/10"
          aria-hidden="true"
        />
        <span className="relative inline-flex items-center">Staff&apos;s Details</span>
      </section>

      <section className="relative mt-4 overflow-hidden rounded-3xl border border-white/50 bg-white/38 p-5 shadow-soft backdrop-blur-xl sm:p-6">
        <div
          className="absolute inset-0 bg-gradient-to-br from-white/28 via-blue-100/20 to-indigo-100/14"
          aria-hidden="true"
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700/85">
            Account Details
          </p>
          <dl className="mt-4 divide-y divide-slate-200/55 overflow-hidden rounded-2xl border border-white/55 bg-white/58 backdrop-blur-sm">
            {profileRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-1 gap-1 px-4 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-5"
              >
                <dt className="text-sm font-medium text-slate-500">{row.label}</dt>
                <dd
                  className={`break-words text-left text-sm font-semibold leading-tight text-slate-900 sm:text-right ${row.mono ? "break-all font-mono text-[13px] sm:text-sm" : ""}`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handlePasswordChange}
          disabled={isSendingReset || !accountEmail}
          className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border border-slate-200/60 bg-white/58 px-4 py-4 text-lg font-semibold text-slate-800 shadow-soft backdrop-blur-md transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[70px] sm:text-xl"
        >
          <LockKeyhole size={20} strokeWidth={2} />
          {isSendingReset ? "Sending reset link..." : "Change Password"}
        </button>

        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-2xl border border-indigo-400/45 bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-4 text-lg font-semibold text-white shadow-float transition-transform hover:-translate-y-0.5 sm:min-h-[70px] sm:text-xl"
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
    </>
  );
}
