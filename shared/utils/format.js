import { MENU_ITEM_STATUS, ORDER_STATUS } from "../types/canteen";

export const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

export const formatDateTime = (value) => {
  if (!value) return "Just now";

  const date =
    value instanceof Date
      ? value
      : typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "Just now";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const formatStatusLabel = (status) => {
  const safeStatus = String(status || "").toLowerCase();

  if (safeStatus === MENU_ITEM_STATUS.AVAILABLE) return "Available";
  if (safeStatus === MENU_ITEM_STATUS.LIMITED) return "Limited";
  if (safeStatus === MENU_ITEM_STATUS.SOLD_OUT) return "Sold Out";
  if (safeStatus === MENU_ITEM_STATUS.HIDDEN) return "Hidden";
  if (safeStatus === ORDER_STATUS.COLLECTED) return "Collected";
  if (safeStatus === ORDER_STATUS.CANCELLED) return "Cancelled";
  return "Placed";
};

export const formatQuantityHint = (quantity, status) => {
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const safeStatus = String(status || "").toLowerCase();

  if (safeStatus === MENU_ITEM_STATUS.SOLD_OUT || safeQuantity <= 0) {
    return "Sold out";
  }

  if (safeStatus === MENU_ITEM_STATUS.LIMITED || safeQuantity <= 5) {
    return `Only ${safeQuantity} left`;
  }

  return `${safeQuantity} available`;
};

export const formatToken = (tokenNumber) =>
  String(tokenNumber || "").trim() || "Pending";
