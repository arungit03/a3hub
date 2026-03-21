const { getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const LOW_STOCK_THRESHOLD = 5;
const ALLOWED_ORDERING_ROLES = new Set(["student", "staff", "admin"]);
const BLOCKED_STATUSES = new Set(["blocked", "pending", "pending_approval"]);

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const getDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const buildTokenNumber = (dateKey, sequence) => {
  const compactDate = String(dateKey || "").replace(/-/g, "");
  const suffix = compactDate.slice(-4) || "0000";
  return `${suffix}-${String(sequence).padStart(3, "0")}`;
};

const resolveMenuStatus = ({ visible, quantity, status }) => {
  const safeQuantity = toPositiveInteger(quantity);
  const safeStatus = normalizeText(status).toLowerCase();

  if (!visible || safeStatus === "hidden") return "hidden";
  if (safeQuantity <= 0) return "sold_out";
  if (safeStatus === "sold_out") return "sold_out";
  if (safeStatus === "limited" || safeQuantity <= LOW_STOCK_THRESHOLD) {
    return "limited";
  }
  return "available";
};

const collapseRequestedItems = (items = []) => {
  const merged = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const menuItemId = normalizeText(item?.menuItemId || item?.id);
    const quantity = toPositiveInteger(item?.quantity);

    if (!menuItemId || quantity <= 0) {
      return;
    }

    merged.set(menuItemId, (merged.get(menuItemId) || 0) + quantity);
  });

  return [...merged.entries()].map(([menuItemId, quantity]) => ({
    menuItemId,
    quantity,
  }));
};

const validateRequestedItems = (items = []) => {
  const collapsed = collapseRequestedItems(items);

  if (collapsed.length === 0) {
    throw new HttpsError("invalid-argument", "Add at least one valid menu item.");
  }

  if (collapsed.length > 20) {
    throw new HttpsError(
      "invalid-argument",
      "Too many distinct items in a single order."
    );
  }

  return collapsed;
};

const assertAllowedOrderingUser = (profile = {}) => {
  const role = normalizeText(profile?.role).toLowerCase();
  const status = normalizeText(profile?.status).toLowerCase();

  if (!ALLOWED_ORDERING_ROLES.has(role)) {
    throw new HttpsError(
      "permission-denied",
      "This account cannot place orders from the main A3 Hub site."
    );
  }

  if (BLOCKED_STATUSES.has(status)) {
    throw new HttpsError(
      "permission-denied",
      "This account is not active for canteen ordering."
    );
  }
};

const createOrderHandler = async (request) => {
  const uid = normalizeText(request?.auth?.uid);
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in before placing an order.");
  }

  const requestedItems = validateRequestedItems(request?.data?.items);
  const userRef = db.collection("users").doc(uid);
  const counterRef = db.collection("systemSettings").doc("canteenOrderCounter");

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) {
      throw new HttpsError("permission-denied", "User profile not found.");
    }

    const userProfile = userSnapshot.data() || {};
    assertAllowedOrderingUser(userProfile);

    const resolvedOrderItems = [];
    let totalAmount = 0;
    let totalItemCount = 0;

    for (const requestedItem of requestedItems) {
      const menuRef = db.collection("menuItems").doc(requestedItem.menuItemId);
      const menuSnapshot = await transaction.get(menuRef);

      if (!menuSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "One of the selected menu items no longer exists."
        );
      }

      const menuData = menuSnapshot.data() || {};
      const currentStatus = resolveMenuStatus({
        visible: menuData.visible !== false,
        quantity: menuData.quantity,
        status: menuData.status,
      });
      const currentQuantity = toPositiveInteger(menuData.quantity);

      if (menuData.visible === false || currentStatus === "hidden") {
        throw new HttpsError(
          "failed-precondition",
          `${menuData.name || "This item"} is currently hidden.`
        );
      }

      if (currentStatus === "sold_out" || currentQuantity < requestedItem.quantity) {
        throw new HttpsError(
          "failed-precondition",
          `${menuData.name || "This item"} does not have enough stock.`
        );
      }

      const nextQuantity = currentQuantity - requestedItem.quantity;
      const nextStatus = resolveMenuStatus({
        visible: menuData.visible !== false,
        quantity: nextQuantity,
        status: menuData.status,
      });
      const unitPrice = Number(menuData.price) || 0;
      const lineTotal = unitPrice * requestedItem.quantity;

      transaction.update(menuRef, {
        quantity: nextQuantity,
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      resolvedOrderItems.push({
        menuItemId: menuSnapshot.id,
        name: normalizeText(menuData.name),
        price: unitPrice,
        quantity: requestedItem.quantity,
        image: normalizeText(menuData.image),
        category: normalizeText(menuData.category),
        lineTotal,
      });

      totalAmount += lineTotal;
      totalItemCount += requestedItem.quantity;
    }

    const now = new Date();
    const createdDateKey = getDateKey(now);
    const counterSnapshot = await transaction.get(counterRef);
    const counterData = counterSnapshot.exists ? counterSnapshot.data() || {} : {};
    const nextSequence =
      normalizeText(counterData.dateKey) === createdDateKey
        ? toPositiveInteger(counterData.lastSequence) + 1
        : 1;
    const tokenNumber = buildTokenNumber(createdDateKey, nextSequence);
    const orderRef = db.collection("orders").doc();
    const userName =
      normalizeText(userProfile.name) ||
      normalizeText(request?.auth?.token?.name) ||
      normalizeText(userProfile.email).split("@")[0] ||
      "A3 Hub User";

    transaction.set(counterRef, {
      dateKey: createdDateKey,
      lastSequence: nextSequence,
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.set(orderRef, {
      userId: uid,
      userName,
      userEmail:
        normalizeText(userProfile.email) || normalizeText(request?.auth?.token?.email),
      items: resolvedOrderItems,
      totalAmount,
      itemCount: totalItemCount,
      status: "placed",
      tokenNumber,
      createdDateKey,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      orderId: orderRef.id,
      tokenNumber,
      totalAmount,
      itemCount: totalItemCount,
      status: "placed",
    };
  });
};

module.exports = {
  createOrderHandler,
};
