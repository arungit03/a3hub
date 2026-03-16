import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { useToast } from "../hooks/useToast";
import { db } from "../lib/firebase";
import { useAutosaveDraft } from "../hooks/useAutosaveDraft";
import { useDirtyPrompt } from "../hooks/useDirtyPrompt";
import { useAuth } from "../state/auth";

const trimValue = (value) => (value || "").trim();

const normalizeUrl = (value) => {
  const next = trimValue(value);
  if (!next) return "";
  if (/^https?:\/\//i.test(next)) return next;
  return `https://${next}`;
};

const isValidUrlInput = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return true;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const formatDate = (value) => {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function BookSubjectPage({ forcedRole }) {
  const { role: contextRole, user } = useAuth();
  const { success, error: toastError, info } = useToast();
  const role = forcedRole || contextRole;
  const isStaff = role === "staff";
  const navigate = useNavigate();
  const { subjectId = "" } = useParams();
  const booksPath = isStaff ? "/staff/menu/books" : "/student/menu/books";

  const [subject, setSubject] = useState(null);
  const [loadingSubject, setLoadingSubject] = useState(true);
  const [subjectError, setSubjectError] = useState("");

  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitsError, setUnitsError] = useState("");

  const [creatingUnit, setCreatingUnit] = useState(false);
  const [removingUnitId, setRemovingUnitId] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [unitStatus, setUnitStatus] = useState("");
  const [unitForm, setUnitForm] = useState({
    unitLabel: "",
    topic: "",
    link: "",
  });

  const unitDraftKey = useMemo(() => {
    if (!isStaff || !user?.uid || !subjectId) return "";
    return `a3hub:draft:book-unit:${user.uid}:${subjectId}`;
  }, [isStaff, subjectId, user?.uid]);

  const restoreUnitDraft = useCallback((draftValue) => {
    if (!draftValue || typeof draftValue !== "object") return;
    setUnitForm((prev) => ({
      ...prev,
      ...draftValue,
    }));
    info("Restored saved unit draft.");
  }, [info]);

  const { clearDraft } = useAutosaveDraft({
    key: unitDraftKey,
    value: unitForm,
    onRestore: restoreUnitDraft,
    enabled: isStaff && Boolean(user?.uid) && Boolean(subjectId),
  });

  const isUnitFormDirty = useMemo(
    () => Object.values(unitForm).some((value) => trimValue(value)),
    [unitForm]
  );

  useDirtyPrompt(
    isStaff && isUnitFormDirty && !creatingUnit,
    "You have unsaved unit form changes. Leave this page?"
  );

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleUnitFieldChange = useCallback(
    (field, value) => {
      setUnitForm((prev) => ({
        ...prev,
        [field]: value,
      }));
      clearFieldError(field);
      setUnitStatus("");
    },
    [clearFieldError]
  );

  const validateUnitForm = useCallback(() => {
    const nextErrors = {};

    if (!trimValue(unitForm.unitLabel)) {
      nextErrors.unitLabel = "Unit label is required.";
    }
    if (!trimValue(unitForm.topic)) {
      nextErrors.topic = "Topic is required.";
    }
    if (!isValidUrlInput(unitForm.link)) {
      nextErrors.link = "Enter a valid URL.";
    }

    return nextErrors;
  }, [unitForm.link, unitForm.topic, unitForm.unitLabel]);

  useEffect(() => {
    if (!subjectId) {
      setLoadingSubject(false);
      setLoadingUnits(false);
      setSubjectError("Invalid subject.");
      setUnitsError("Invalid subject.");
      return undefined;
    }

    setLoadingSubject(true);
    setLoadingUnits(true);
    setSubjectError("");
    setUnitsError("");

    const unsubscribeSubject = onSnapshot(
      doc(db, "books", subjectId),
      (snapshot) => {
        if (snapshot.exists()) {
          setSubject({ id: snapshot.id, ...snapshot.data() });
          setSubjectError("");
        } else {
          setSubject(null);
          setSubjectError("Subject not found.");
        }
        setLoadingSubject(false);
      },
      () => {
        setSubject(null);
        setLoadingSubject(false);
        setSubjectError("Unable to load subject.");
      }
    );

    const unitsQuery = query(
      collection(db, "books", subjectId, "units"),
      orderBy("createdAt", "desc"),
      limit(300)
    );

    const unsubscribeUnits = onSnapshot(
      unitsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setUnits(next);
        setLoadingUnits(false);
        setUnitsError("");
      },
      () => {
        setUnits([]);
        setLoadingUnits(false);
        setUnitsError("Unable to load units.");
      }
    );

    return () => {
      unsubscribeSubject();
      unsubscribeUnits();
    };
  }, [subjectId]);

  const handleAddUnit = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingUnit || !subjectId) return;

    const unitLabel = trimValue(unitForm.unitLabel);
    const topic = trimValue(unitForm.topic);
    const link = normalizeUrl(unitForm.link);

    const validationErrors = validateUnitForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setUnitStatus("Please correct the highlighted fields.");
      toastError("Please correct the highlighted unit form fields.");
      return;
    }

    setCreatingUnit(true);
    setUnitStatus("");

    try {
      await addDoc(collection(db, "books", subjectId, "units"), {
        unitLabel,
        topic,
        link,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });

      setUnitForm({
        unitLabel: "",
        topic: "",
        link: "",
      });
      setFieldErrors({});
      clearDraft();
      setUnitStatus("Unit added.");
      success("Unit added.");
    } catch {
      setUnitStatus("Unable to add unit.");
      toastError("Unable to add unit.");
    } finally {
      setCreatingUnit(false);
    }
  };

  const handleRemoveUnit = async (unitId) => {
    if (!isStaff || !subjectId || !unitId || removingUnitId) return;
    const ok = window.confirm("Remove this unit?");
    if (!ok) return;

    setRemovingUnitId(unitId);
    setUnitStatus("");

    try {
      await deleteDoc(doc(db, "books", subjectId, "units", unitId));
      setUnitStatus("Unit removed.");
      success("Unit removed.");
    } catch {
      setUnitStatus("Unable to remove unit.");
      toastError("Unable to remove unit.");
    } finally {
      setRemovingUnitId("");
    }
  };

  return (
    <>
      <GradientHeader
        title={trimValue(subject?.subject) || "Subject"}
        subtitle="Unit labels and topics"
        rightSlot={
          <div className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            {isStaff ? "Staff" : "Student"}
          </div>
        }
      />

      <section className="grid gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(booksPath)}
            className="rounded-full border border-clay/35 bg-white px-3 py-1 text-xs font-semibold text-ink/80 hover:border-clay/55"
          >
            Back to Subjects
          </button>
        </div>

        <Card>
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-ink/80">Topic List</p>
            <h3 className="text-xl font-semibold text-ink">{units.length} {units.length === 1 ? "unit" : "units"}</h3>
          </div>

          {loadingSubject || loadingUnits ? (
            <p className="mt-4 text-sm text-ink/75">Loading...</p>
          ) : subjectError ? (
            <p className="mt-4 text-sm text-ink/75">{subjectError}</p>
          ) : unitsError ? (
            <p className="mt-4 text-sm text-ink/75">{unitsError}</p>
          ) : units.length === 0 ? (
            <p className="mt-4 text-sm text-ink/75">
              No units added yet. {isStaff ? "Add the first unit below." : ""}
            </p>
          ) : (
            <div className="mt-4 grid gap-2">
              {units.map((unit, index) => (
                <div
                  key={unit.id}
                  className="rounded-xl border border-clay/20 bg-cream/80 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {index + 1}. {trimValue(unit.unitLabel) || "Unit"}
                      </p>
                      <p className="mt-1 text-xs text-ink/80">
                        {trimValue(unit.topic) || "Topic not set"}
                      </p>
                      <p className="mt-1 text-[11px] text-ink/65">
                        {unit.createdAt ? `Added ${formatDate(unit.createdAt)}` : "Added recently"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {trimValue(unit.link) ? (
                        <a
                          href={normalizeUrl(unit.link)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 hover:border-clay/55"
                        >
                          Open
                        </a>
                      ) : null}
                      {isStaff ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveUnit(unit.id)}
                          disabled={removingUnitId === unit.id}
                          className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 hover:border-clay/55 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingUnitId === unit.id ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {isStaff ? (
          <Card className="bg-cream">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">Staff Control</p>
              <h3 className="text-xl font-semibold text-ink">Add Unit Topic</h3>
            </div>

            <form onSubmit={handleAddUnit} className="mt-4 grid gap-3">
              <input
                type="text"
                value={unitForm.unitLabel}
                onChange={(event) =>
                  handleUnitFieldChange("unitLabel", event.target.value)
                }
                placeholder="Unit label (e.g. Unit 1)"
                className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
              />
              {fieldErrors.unitLabel ? (
                <p className="text-xs font-semibold text-rose-700">
                  {fieldErrors.unitLabel}
                </p>
              ) : null}
              <input
                type="text"
                value={unitForm.topic}
                onChange={(event) =>
                  handleUnitFieldChange("topic", event.target.value)
                }
                placeholder="Topic"
                className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
              />
              {fieldErrors.topic ? (
                <p className="text-xs font-semibold text-rose-700">
                  {fieldErrors.topic}
                </p>
              ) : null}
              <input
                type="text"
                value={unitForm.link}
                onChange={(event) =>
                  handleUnitFieldChange("link", event.target.value)
                }
                placeholder="Link "
                className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
              />
              {fieldErrors.link ? (
                <p className="text-xs font-semibold text-rose-700">
                  {fieldErrors.link}
                </p>
              ) : null}

              {unitStatus ? (
                <p className="text-xs font-semibold text-ink/80">{unitStatus}</p>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creatingUnit}
                  className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {creatingUnit ? "Adding..." : "Add Unit"}
                </button>
              </div>
            </form>
          </Card>
        ) : unitStatus ? (
          <p className="text-xs font-semibold text-ink/80">{unitStatus}</p>
        ) : null}
      </section>
    </>
  );
}

