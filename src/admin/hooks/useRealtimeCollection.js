import { useEffect, useRef, useState } from "react";
import { onSnapshot } from "firebase/firestore";

const defaultMapper = (docItem) => ({ id: docItem.id, ...docItem.data() });
const EMPTY_DATA = [];

export function useRealtimeCollection(queryRef, options = {}) {
  const {
    enabled = true,
    map = defaultMapper,
    initialData = [],
    onErrorMessage = "Unable to load data.",
  } = options;
  const safeInitialData = Array.isArray(initialData) ? initialData : EMPTY_DATA;
  const mapRef = useRef(map);
  const errorMessageRef = useRef(onErrorMessage);
  const initialDataRef = useRef(safeInitialData);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);
  useEffect(() => {
    errorMessageRef.current = onErrorMessage;
  }, [onErrorMessage]);

  const [data, setData] = useState(safeInitialData);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !queryRef) {
      setData(initialDataRef.current);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        setData(snapshot.docs.map((docItem) => mapRef.current(docItem)));
        setLoading(false);
        setError("");
      },
      () => {
        setData(initialDataRef.current);
        setLoading(false);
        setError(errorMessageRef.current);
      }
    );

    return () => unsubscribe();
  }, [enabled, queryRef]);

  return { data, loading, error };
}
