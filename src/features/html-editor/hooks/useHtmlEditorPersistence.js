import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureFirestore } from "../../../lib/firebase.js";
import { useAuth } from "../../../state/auth.jsx";
import { HTML_EDITOR_COLLECTIONS } from "../lib/htmlEditor.js";

const LOCAL_STORAGE_PREFIX = "a3hub.html-editor";

const toSafeText = (value) => String(value || "").trim();

const toSafeSnippet = (value) => ({
  id: toSafeText(value?.id),
  userId: toSafeText(value?.userId),
  title: toSafeText(value?.title) || "Untitled HTML Snippet",
  code: String(value?.code || ""),
  createdAt: value?.createdAt || "",
  updatedAt: value?.updatedAt || "",
});

const getLocalStorageKey = (userId) =>
  `${LOCAL_STORAGE_PREFIX}.${toSafeText(userId) || "guest"}`;

const loadLocalSnippets = (userId) => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getLocalStorageKey(userId));
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(toSafeSnippet).filter((item) => item.id) : [];
  } catch {
    return [];
  }
};

const saveLocalSnippets = (userId, snippets) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(snippets));
  } catch {
    // Ignore local storage write issues.
  }
};

const sortSnippets = (items) =>
  items
    .slice()
    .sort(
      (left, right) =>
        new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    );

export function useHtmlEditorPersistence() {
  const { user } = useAuth();
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const connect = async () => {
      setLoading(true);
      setError("");

      const localSnippets = sortSnippets(loadLocalSnippets(user?.uid || "guest"));
      if (!cancelled) {
        setSnippets(localSnippets);
      }

      if (!user?.uid) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const firestore = await ensureFirestore();
        if (!firestore) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        const { collection, onSnapshot, query, where } = await import(
          "firebase/firestore"
        );
        const snippetQuery = query(
          collection(firestore, HTML_EDITOR_COLLECTIONS.snippets),
          where("userId", "==", user.uid)
        );

        unsubscribe = onSnapshot(
          snippetQuery,
          (snapshot) => {
            if (cancelled) return;
            const nextSnippets = sortSnippets(
              snapshot.docs.map((docItem) => toSafeSnippet({ id: docItem.id, ...docItem.data() }))
            );
            setSnippets(nextSnippets);
            saveLocalSnippets(user.uid, nextSnippets);
            setLoading(false);
            setError("");
          },
          () => {
            if (cancelled) return;
            setSnippets(localSnippets);
            setLoading(false);
            setError("Using local HTML snippets because Firestore is unavailable.");
          }
        );
      } catch {
        if (!cancelled) {
          setSnippets(localSnippets);
          setLoading(false);
          setError("Using local HTML snippets because Firestore is unavailable.");
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.uid]);

  const saveSnippet = useCallback(
    async ({ id = "", title, code, sourceId = "", sourceTitle = "" }) => {
      const safeTitle = toSafeText(title) || "Untitled HTML Snippet";
      const nowIso = new Date().toISOString();
      const safeId = toSafeText(id) || `${toSafeText(user?.uid) || "guest"}-${Date.now()}`;
      const payload = toSafeSnippet({
        id: safeId,
        userId: user?.uid || "guest",
        title: safeTitle,
        code,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const nextSnippets = sortSnippets([
        payload,
        ...snippets.filter((item) => item.id !== safeId),
      ]);
      setSnippets(nextSnippets);
      saveLocalSnippets(user?.uid || "guest", nextSnippets);

      try {
        const firestore = await ensureFirestore();
        if (!firestore || !user?.uid) {
          return payload;
        }

        const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
        await setDoc(
          doc(firestore, HTML_EDITOR_COLLECTIONS.snippets, safeId),
          {
            id: safeId,
            userId: user.uid,
            title: safeTitle,
            code: String(code || ""),
            sourceId: toSafeText(sourceId),
            sourceTitle: toSafeText(sourceTitle),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        setError("Saved locally. Firestore sync is not available right now.");
      }

      return payload;
    },
    [snippets, user?.uid]
  );

  const saveEditorHistory = useCallback(
    async ({ lastSnippetId = "", lastExampleId = "", recentExampleIds = [] }) => {
      if (!user?.uid) {
        return;
      }

      try {
        const firestore = await ensureFirestore();
        if (!firestore) return;

        const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
        await setDoc(
          doc(firestore, HTML_EDITOR_COLLECTIONS.history, user.uid),
          {
            userId: user.uid,
            lastSnippetId: toSafeText(lastSnippetId),
            lastExampleId: toSafeText(lastExampleId),
            recentExampleIds: Array.from(
              new Set(
                (recentExampleIds || [])
                  .map((item) => toSafeText(item))
                  .filter(Boolean)
              )
            ).slice(0, 8),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Non-blocking helper.
      }
    },
    [user?.uid]
  );

  const savePracticeProgress = useCallback(
    async ({ topicId = "", problemId = "", snippetId = "" }) => {
      if (!user?.uid || !toSafeText(topicId)) {
        return;
      }

      try {
        const firestore = await ensureFirestore();
        if (!firestore) return;

        const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
        const progressId = `${user.uid}_${toSafeText(topicId)}_${toSafeText(problemId) || "topic"}`;
        await setDoc(
          doc(firestore, HTML_EDITOR_COLLECTIONS.practice, progressId),
          {
            id: progressId,
            userId: user.uid,
            topicId: toSafeText(topicId),
            problemId: toSafeText(problemId),
            snippetId: toSafeText(snippetId),
            completed: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Non-blocking helper.
      }
    },
    [user?.uid]
  );

  return useMemo(
    () => ({
      snippets,
      loading,
      error,
      saveSnippet,
      saveEditorHistory,
      savePracticeProgress,
    }),
    [error, loading, saveEditorHistory, savePracticeProgress, saveSnippet, snippets]
  );
}
