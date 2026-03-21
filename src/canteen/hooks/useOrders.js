import { useEffect, useMemo, useState } from "react";
import { listenOrdersForStaff } from "../services/canteenService";

export const useOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = listenOrdersForStaff(
      (nextOrders) => {
        setOrders(nextOrders);
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        setLoading(false);
        setError(snapshotError?.message || "Unable to load orders.");
      }
    );

    return unsubscribe;
  }, []);

  const grouped = useMemo(
    () => ({
      placed: orders.filter((order) => order.status === "placed"),
      collected: orders.filter((order) => order.status === "collected"),
      cancelled: orders.filter((order) => order.status === "cancelled"),
    }),
    [orders]
  );

  return {
    orders,
    grouped,
    loading,
    error,
  };
};
