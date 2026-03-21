import { useEffect, useMemo, useState } from "react";
import { normalizeText } from "../../../shared/types/canteen.js";
import { listenMenuItemsForStaff } from "../services/canteenService";

export const useMenuManagement = ({ search = "", category = "all" } = {}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = listenMenuItemsForStaff(
      (nextItems) => {
        setItems(nextItems);
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        setLoading(false);
        setError(snapshotError?.message || "Unable to load menu items.");
      }
    );

    return unsubscribe;
  }, []);

  const safeSearch = normalizeText(search).toLowerCase();
  const safeCategory = normalizeText(category).toLowerCase();

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesCategory =
          safeCategory === "all" ||
          normalizeText(item.category).toLowerCase() === safeCategory;

        const matchesSearch =
          !safeSearch ||
          [item.name, item.description, item.category]
            .join(" ")
            .toLowerCase()
            .includes(safeSearch);

        return matchesCategory && matchesSearch;
      }),
    [items, safeCategory, safeSearch]
  );

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))],
    [items]
  );

  return {
    items,
    filteredItems,
    categories,
    loading,
    error,
  };
};
