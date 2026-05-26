import { useEffect, useState } from "react";
import {
  LEARNING_CATALOG,
  LEARNING_COLLECTIONS,
  buildLearningCatalog,
} from "../data/catalog.js";
import { ensureSupabaseData } from "../../../lib/supabase.js";

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
        const database = await ensureSupabaseData();
        if (!database) {
          if (!cancelled) {
            setState(INITIAL_STATE);
          }
          return;
        }

        const { collection, getDocs, query } = await import("../../../lib/supabaseData.js");
        const [courseSnap, topicSnap, quizSnap, problemSnap] = await Promise.all([
          getDocs(query(collection(database, LEARNING_COLLECTIONS.courses))),
          getDocs(query(collection(database, LEARNING_COLLECTIONS.topics))),
          getDocs(query(collection(database, LEARNING_COLLECTIONS.quizzes))),
          getDocs(query(collection(database, LEARNING_COLLECTIONS.problems))),
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
          source: "supabase",
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

