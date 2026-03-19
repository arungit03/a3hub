import { useEffect, useState } from "react";
import {
  LEARNING_CATALOG,
  LEARNING_COLLECTIONS,
  buildLearningCatalog,
} from "../data/catalog.js";
import { ensureFirestore } from "../../../lib/firebase.js";

const INITIAL_STATE = Object.freeze({
  catalog: LEARNING_CATALOG,
  loading: false,
  error: "",
  source: "seed",
});

const mapSnapshotDocs = (snapshot) =>
  snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));

export function useLearningCatalog() {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setState((previous) => ({ ...previous, loading: true, error: "" }));

      try {
        const firestore = await ensureFirestore();
        if (!firestore) {
          if (!cancelled) {
            setState(INITIAL_STATE);
          }
          return;
        }

        const { collection, getDocs, query } = await import("firebase/firestore");
        const [courseSnap, topicSnap, quizSnap, problemSnap] = await Promise.all([
          getDocs(query(collection(firestore, LEARNING_COLLECTIONS.courses))),
          getDocs(query(collection(firestore, LEARNING_COLLECTIONS.topics))),
          getDocs(query(collection(firestore, LEARNING_COLLECTIONS.quizzes))),
          getDocs(query(collection(firestore, LEARNING_COLLECTIONS.problems))),
        ]);

        if (cancelled) return;

        const catalog = buildLearningCatalog({
          courseDocs: mapSnapshotDocs(courseSnap),
          topicDocs: mapSnapshotDocs(topicSnap),
          quizDocs: mapSnapshotDocs(quizSnap),
          problemDocs: mapSnapshotDocs(problemSnap),
        });

        setState({
          catalog,
          loading: false,
          error: "",
          source: "firestore",
        });
      } catch {
        if (!cancelled) {
          setState({
            catalog: LEARNING_CATALOG,
            loading: false,
            error: "Using built-in lessons because custom learning content could not be loaded.",
            source: "seed",
          });
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
