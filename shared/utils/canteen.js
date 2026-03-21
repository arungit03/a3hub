import {
  LOW_STOCK_THRESHOLD,
  MENU_ITEM_STATUS,
  deriveMenuItemStatus,
  normalizeText,
  toInteger,
  toNumber,
} from "../types/canteen";
import { normalizeRemoteImageUrl } from "./media";

export const getLocalDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const buildTokenNumber = (dateKey, sequence) => {
  const compactDate = String(dateKey || "").replace(/-/g, "");
  const suffix = compactDate.slice(-4) || "0000";
  return `${suffix}-${String(Math.max(1, Number(sequence) || 1)).padStart(3, "0")}`;
};

export const buildClientOrderId = (userId, dateKey, sequence) => {
  const safeUserId = normalizeText(userId) || "user";
  const compactDate = String(dateKey || "").replace(/-/g, "") || "00000000";
  const safeSequence = String(Math.max(1, Number(sequence) || 1)).padStart(4, "0");
  return `${safeUserId}_${compactDate}_${safeSequence}`;
};

export const sortMenuItems = (items = []) =>
  [...items].sort((left, right) => {
    const categoryCompare = String(left?.category || "").localeCompare(
      String(right?.category || ""),
      undefined,
      { sensitivity: "base" }
    );
    if (categoryCompare !== 0) return categoryCompare;
    return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
      sensitivity: "base",
    });
  });

export const sortOrdersByNewest = (orders = []) =>
  [...orders].sort((left, right) => {
    const leftDate =
      typeof left?.createdAt?.toDate === "function"
        ? left.createdAt.toDate().getTime()
        : new Date(left?.createdAt || 0).getTime();
    const rightDate =
      typeof right?.createdAt?.toDate === "function"
        ? right.createdAt.toDate().getTime()
        : new Date(right?.createdAt || 0).getTime();
    return rightDate - leftDate;
  });

export const calculateCartTotal = (items = []) =>
  items.reduce(
    (sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0
  );

export const calculateCartCount = (items = []) =>
  items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);

export const buildMenuItemPayload = (values = {}, userId = "", existing = null) => {
  const quantity = toInteger(values.quantity);
  const requestedStatus = normalizeText(values.status).toLowerCase();
  const visible =
    values.visible !== false && requestedStatus !== MENU_ITEM_STATUS.HIDDEN;
  const effectiveStatus = deriveMenuItemStatus({
    quantity,
    visible,
    status: requestedStatus || existing?.status || MENU_ITEM_STATUS.AVAILABLE,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  });

  return {
    name: normalizeText(values.name),
    description: normalizeText(values.description),
    image: normalizeRemoteImageUrl(values.image),
    price: toNumber(values.price),
    category: normalizeText(values.category),
    quantity,
    status: effectiveStatus,
    visible: effectiveStatus !== MENU_ITEM_STATUS.HIDDEN,
    createdBy: existing?.createdBy || normalizeText(userId),
  };
};

export const getMenuStatusTone = (status) => {
  if (status === MENU_ITEM_STATUS.AVAILABLE) return "success";
  if (status === MENU_ITEM_STATUS.LIMITED) return "warning";
  if (status === MENU_ITEM_STATUS.SOLD_OUT) return "danger";
  return "neutral";
};

export const getOrderStatusTone = (status) => {
  if (status === "collected") return "success";
  if (status === "cancelled") return "danger";
  return "info";
};

export const buildStockMessage = (item) => {
  const quantity = toInteger(item?.quantity);
  const effectiveStatus = deriveMenuItemStatus(item || {});
  if (effectiveStatus === MENU_ITEM_STATUS.SOLD_OUT || quantity <= 0) {
    return "Sold Out";
  }
  if (effectiveStatus === MENU_ITEM_STATUS.LIMITED || quantity <= LOW_STOCK_THRESHOLD) {
    return `Only ${quantity} left`;
  }
  return "Available now";
};
