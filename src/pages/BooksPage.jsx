import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import GradientHeader from "../components/GradientHeader";
import { db } from "../lib/firebase";
import { useAuth } from "../state/auth";

const trimValue = (value) => (value || "").trim();

const normalizeSubjectKey = (value) =>
  trimValue(value)
    .toLowerCase()
    .replace(/\s+/g, " ");

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

export default function BooksPage({ forcedRole }) {
  const { role: contextRole, user } = useAuth();
  const role = forcedRole || contextRole;
  const isStaff = role === "staff";
  const navigate = useNavigate();
  const roleBasePath = isStaff ? "/staff/menu/books" : "/student/menu/books";

  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState("");
  const [creatingBook, setCreatingBook] = useState(false);
  const [removingBookId, setRemovingBookId] = useState("");
  const [bookStatus, setBookStatus] = useState("");
  const [bookForm, setBookForm] = useState({
    subject: "",
  });

  useEffect(() => {
    const canViewBooks = role === "staff" || role === "student";
    if (!canViewBooks) {
      setBooks([]);
      setLoadingBooks(false);
      setBooksError("");
      return undefined;
    }

    setLoadingBooks(true);
    setBooksError("");

    const booksQuery = query(
      collection(db, "books"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      booksQuery,
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setBooks(next);
        setLoadingBooks(false);
        setBooksError("");
      },
      () => {
        setBooks([]);
        setLoadingBooks(false);
        setBooksError("Unable to load subjects.");
      }
    );

    return () => unsubscribe();
  }, [role]);

  const subjects = useMemo(() => {
    const grouped = new Map();

    books.forEach((book) => {
      const subjectLabel = trimValue(book.subject) || "General";
      const subjectKey = normalizeSubjectKey(subjectLabel) || "general";
      const existing = grouped.get(subjectKey);

      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(subjectKey, {
          id: book.id,
          key: subjectKey,
          label: subjectLabel,
          createdAt: book.createdAt || null,
          count: 1,
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "en-US", { sensitivity: "base" })
    );
  }, [books]);

  const handleAddBook = async (event) => {
    event.preventDefault();
    if (!isStaff || creatingBook) return;

    const subject = trimValue(bookForm.subject);
    const subjectKey = normalizeSubjectKey(subject);

    if (!subject) {
      setBookStatus("Enter subject.");
      return;
    }

    const alreadyExists = subjects.some((item) => item.key === subjectKey);
    if (alreadyExists) {
      setBookStatus("Subject already exists.");
      return;
    }

    setCreatingBook(true);
    setBookStatus("");

    try {
      await addDoc(collection(db, "books"), {
        subject,
        subjectKey,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });

      setBookForm({
        subject: "",
      });
      setBookStatus("Subject added. Open it to add unit label and topic.");
    } catch {
      setBookStatus("Unable to add subject.");
    } finally {
      setCreatingBook(false);
    }
  };

  const handleRemoveBook = async (bookId) => {
    if (!isStaff || !bookId || removingBookId) return;
    const ok = window.confirm("Remove this subject and all its units?");
    if (!ok) return;

    setRemovingBookId(bookId);
    setBookStatus("");

    try {
      const unitsRef = collection(db, "books", bookId, "units");
      const unitsSnapshot = await getDocs(unitsRef);
      const batch = writeBatch(db);

      unitsSnapshot.docs.forEach((unitDoc) => {
        batch.delete(unitDoc.ref);
      });

      batch.delete(doc(db, "books", bookId));
      await batch.commit();
      setBookStatus("Subject removed.");
    } catch {
      setBookStatus("Unable to remove subject.");
    } finally {
      setRemovingBookId("");
    }
  };

  return (
    <>
      <GradientHeader
        title="Books"
        subtitle="Create subjects and open each one to add unit label and topic."
        rightSlot={
          <div className="rounded-full border border-clay/30 bg-white px-3 py-1 text-xs font-semibold text-black">
            {isStaff ? "Staff" : "Student"}
          </div>
        }
      />

      <section className="grid gap-4">
        <Card>
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
              Subjects
            </p>
            <h3 className="text-xl font-semibold text-ink">
              {subjects.length} {subjects.length === 1 ? "subject" : "subjects"}
            </h3>
            <p className="mt-1 text-xs text-ink/70">
              Tap Open to manage or view unit labels and topics.
            </p>
          </div>

          {loadingBooks ? (
            <p className="mt-4 text-sm text-ink/75">Loading subjects...</p>
          ) : booksError ? (
            <p className="mt-4 text-sm text-ink/75">{booksError}</p>
          ) : subjects.length === 0 ? (
            <p className="mt-4 text-sm text-ink/75">
              No subjects added yet. {isStaff ? "Add the first subject below." : ""}
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {subjects.map((subject) => (
                <div
                  key={subject.key}
                  className="rounded-2xl border border-clay/30 bg-white/95 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist/45 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`${roleBasePath}/${subject.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-base font-semibold text-ink">
                        {subject.label}
                      </p>
                      <p className="text-xs text-ink/70">
                        {subject.createdAt
                          ? `Created ${formatDate(subject.createdAt)}`
                          : "Created recently"}
                        {subject.count > 1 ? ` | ${subject.count} entries` : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`${roleBasePath}/${subject.id}`)}
                        className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 hover:border-clay/55"
                      >
                        Open
                      </button>
                      {isStaff ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveBook(subject.id)}
                          disabled={removingBookId === subject.id}
                          className="rounded-full border border-clay/35 bg-white px-3 py-1 text-[11px] font-semibold text-ink/80 hover:border-clay/55 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingBookId === subject.id ? "Removing..." : "Remove"}
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
              <p className="text-sm uppercase tracking-[0.18em] text-ink/80">
                Staff Control
              </p>
              <h3 className="text-xl font-semibold text-ink">Add Subject</h3>
            </div>

            <form onSubmit={handleAddBook} className="mt-4 grid gap-3">
              <input
                type="text"
                value={bookForm.subject}
                onChange={(event) => {
                  setBookForm((prev) => ({
                    ...prev,
                    subject: event.target.value,
                  }));
                  setBookStatus("");
                }}
                placeholder="Subject (e.g. Maths)"
                className="w-full rounded-xl border border-clay/25 bg-white px-3 py-2 text-sm placeholder:text-ink/50"
              />

              {bookStatus ? (
                <p className="text-xs font-semibold text-ink/80">{bookStatus}</p>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creatingBook}
                  className="rounded-xl bg-clay px-4 py-2 text-sm font-semibold text-black shadow disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {creatingBook ? "Adding..." : "Add Subject"}
                </button>
              </div>
            </form>
          </Card>
        ) : bookStatus ? (
          <p className="text-xs font-semibold text-ink/80">{bookStatus}</p>
        ) : null}
      </section>
    </>
  );
}
