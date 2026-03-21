import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  MENU_ITEM_STATUS,
  ORDER_STATUS,
  ORDERING_APP_ALLOWED_ROLES,
  buildMenuItemRecord,
  buildOrderRecord,
  deriveMenuItemStatus,
  normalizeText,
  toInteger,
  toNumber,
} from "../types/canteen";
import {
  buildClientOrderId,
  buildMenuItemPayload,
  buildTokenNumber,
  getLocalDateKey,
  sortMenuItems,
  sortOrdersByNewest,
} from "../utils/canteen";
import {
  validateCheckoutItems,
  validateMenuItemForm,
  validateOrderStatus,
} from "../utils/validation";
import { assertFirebaseReady, auth, db } from "./client";

const MENU_ITEMS_COLLECTION = "menuItems";
const ORDERS_COLLECTION = "orders";

const mapMenuItems = (snapshot) =>
  sortMenuItems(
    snapshot.docs.map((itemDoc) => buildMenuItemRecord(itemDoc.id, itemDoc.data()))
  );

const mapOrders = (snapshot) =>
  sortOrdersByNewest(
    snapshot.docs.map((orderDoc) => buildOrderRecord(orderDoc.id, orderDoc.data()))
  );

const BLOCKED_STATUSES = new Set(["blocked", "pending", "pending_approval"]);

const collapseRequestedItems = (items = []) => {
  const merged = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const menuItemId = normalizeText(item?.id || item?.menuItemId);
    const quantity = toInteger(item?.quantity);
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

const assertAllowedOrderingProfile = (profile = {}) => {
  const role = normalizeText(profile?.role).toLowerCase();
  const status = normalizeText(profile?.status).toLowerCase();

  if (!ORDERING_APP_ALLOWED_ROLES.includes(role)) {
    throw new Error("This account cannot place orders from the main A3 Hub site.");
  }

  if (BLOCKED_STATUSES.has(status)) {
    throw new Error("This account is not active for canteen ordering.");
  }
};

const getPlaceOrderErrorMessage = (error) => {
  const code = normalizeText(error?.code).toLowerCase();
  const message = normalizeText(error?.message);

  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "Canteen ordering permissions are not updated yet. Deploy the latest Firestore rules and try again.";
  }

  if (code === "aborted" || code === "firestore/aborted") {
    return "Stock changed while your order was being placed. Refresh the food page and try again.";
  }

  if (code === "unavailable" || code === "firestore/unavailable") {
    return "Canteen ordering is temporarily unavailable right now. Try again in a moment.";
  }

  return message || "Unable to place the food order right now.";
};

export const listenVisibleMenuItems = (listener, onError) => {
  assertFirebaseReady();
  const itemsQuery = query(
    collection(db, MENU_ITEMS_COLLECTION),
    where("visible", "==", true)
  );

  return onSnapshot(
    itemsQuery,
    (snapshot) => listener(mapMenuItems(snapshot)),
    (error) => onError?.(error)
  );
};

export const listenMenuItemsForStaff = (listener, onError) => {
  assertFirebaseReady();
  return onSnapshot(
    collection(db, MENU_ITEMS_COLLECTION),
    (snapshot) => listener(mapMenuItems(snapshot)),
    (error) => onError?.(error)
  );
};

export const listenOrdersForStudent = (userId, listener, onError) => {
  assertFirebaseReady();
  if (!normalizeText(userId)) {
    listener([]);
    return () => {};
  }

  const ordersQuery = query(
    collection(db, ORDERS_COLLECTION),
    where("userId", "==", normalizeText(userId))
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => listener(mapOrders(snapshot)),
    (error) => onError?.(error)
  );
};

export const listenOrdersForStaff = (listener, onError) => {
  assertFirebaseReady();
  return onSnapshot(
    collection(db, ORDERS_COLLECTION),
    (snapshot) => listener(mapOrders(snapshot)),
    (error) => onError?.(error)
  );
};

export const createMenuItem = async (values, userId) => {
  assertFirebaseReady();
  const errors = validateMenuItemForm(values);
  if (Object.keys(errors).length > 0) {
    const error = new Error("Please fix the highlighted menu item fields.");
    error.fieldErrors = errors;
    throw error;
  }

  const payload = buildMenuItemPayload(values, userId);
  return addDoc(collection(db, MENU_ITEMS_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateMenuItem = async (itemId, values, existing = null) => {
  assertFirebaseReady();
  const errors = validateMenuItemForm(values);
  if (Object.keys(errors).length > 0) {
    const error = new Error("Please fix the highlighted menu item fields.");
    error.fieldErrors = errors;
    throw error;
  }

  const payload = buildMenuItemPayload(values, existing?.createdBy || "", existing);
  return updateDoc(doc(db, MENU_ITEMS_COLLECTION, itemId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteMenuItem = async (itemId) => {
  assertFirebaseReady();
  return deleteDoc(doc(db, MENU_ITEMS_COLLECTION, itemId));
};

export const updateOrderStatus = async (orderId, status) => {
  assertFirebaseReady();
  const safeStatus = normalizeText(status).toLowerCase();
  if (!validateOrderStatus(safeStatus) || safeStatus === ORDER_STATUS.PLACED) {
    throw new Error("Only collected or cancelled are allowed here.");
  }

  return updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: safeStatus,
    updatedAt: serverTimestamp(),
  });
};

export const placeOrder = async (items = []) => {
  assertFirebaseReady();
  const currentUser = auth?.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Sign in before placing an order.");
  }

  const checkoutError = validateCheckoutItems(items);
  if (checkoutError) {
    throw new Error(checkoutError);
  }

  const requestedItems = collapseRequestedItems(items);
  if (requestedItems.length === 0) {
    throw new Error("Add at least one valid menu item.");
  }

  const userRef = doc(db, "users", currentUser.uid);
  const counterRef = doc(db, "systemSettings", "canteenOrderCounter");

  try {
    return await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists()) {
        throw new Error("User profile not found.");
      }

      const counterSnapshot = await transaction.get(counterRef);
      const menuRefs = requestedItems.map((requestedItem) =>
        doc(db, MENU_ITEMS_COLLECTION, requestedItem.menuItemId)
      );
      const menuSnapshots = await Promise.all(
        menuRefs.map((menuRef) => transaction.get(menuRef))
      );

      const userProfile = userSnapshot.data() || {};
      assertAllowedOrderingProfile(userProfile);

      const resolvedOrderItems = [];
      let totalAmount = 0;
      let totalItemCount = 0;
      const pendingMenuUpdates = [];

      requestedItems.forEach((requestedItem, index) => {
        const menuRef = menuRefs[index];
        const menuSnapshot = menuSnapshots[index];

        if (!menuSnapshot.exists()) {
          throw new Error("One of the selected menu items no longer exists.");
        }

        const menuData = menuSnapshot.data() || {};
        const currentQuantity = toInteger(menuData.quantity);
        const currentStatus = deriveMenuItemStatus({
          quantity: currentQuantity,
          visible: menuData.visible !== false,
          status: menuData.status,
        });

        if (menuData.visible === false || currentStatus === MENU_ITEM_STATUS.HIDDEN) {
          throw new Error(`${menuData.name || "This item"} is currently hidden.`);
        }

        if (
          currentStatus === MENU_ITEM_STATUS.SOLD_OUT ||
          currentQuantity < requestedItem.quantity
        ) {
          throw new Error(`${menuData.name || "This item"} does not have enough stock.`);
        }

        const nextQuantity = currentQuantity - requestedItem.quantity;
        const nextStatus = deriveMenuItemStatus({
          quantity: nextQuantity,
          visible: menuData.visible !== false,
          status: menuData.status,
        });
        const unitPrice = toNumber(menuData.price);
        const lineTotal = unitPrice * requestedItem.quantity;

        pendingMenuUpdates.push({
          ref: menuRef,
          data: {
          quantity: nextQuantity,
          status: nextStatus,
          updatedAt: serverTimestamp(),
          },
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
      });

      const counterData = counterSnapshot.exists() ? counterSnapshot.data() || {} : {};
      const createdDateKey = getLocalDateKey();
      const nextSequence =
        normalizeText(counterData.dateKey) === createdDateKey
          ? toInteger(counterData.lastSequence) + 1
          : 1;
      const tokenNumber = buildTokenNumber(createdDateKey, nextSequence);
      const orderId = buildClientOrderId(currentUser.uid, createdDateKey, nextSequence);
      const orderRef = doc(db, ORDERS_COLLECTION, orderId);
      const userName =
        normalizeText(userProfile.name) ||
        normalizeText(currentUser.displayName) ||
        normalizeText(userProfile.email).split("@")[0] ||
        normalizeText(currentUser.email).split("@")[0] ||
        "A3 Hub User";
      const userEmail =
        normalizeText(userProfile.email) || normalizeText(currentUser.email);

      pendingMenuUpdates.forEach(({ ref, data }) => {
        transaction.update(ref, data);
      });

      transaction.set(
        counterRef,
        {
          dateKey: createdDateKey,
          lastSequence: nextSequence,
          lastOrderId: orderId,
          lastOrderUserId: currentUser.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(orderRef, {
        userId: currentUser.uid,
        userName,
        userEmail,
        items: resolvedOrderItems,
        totalAmount,
        itemCount: totalItemCount,
        status: ORDER_STATUS.PLACED,
        tokenNumber,
        createdDateKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        orderId,
        tokenNumber,
        totalAmount,
        itemCount: totalItemCount,
        status: ORDER_STATUS.PLACED,
      };
    });
  } catch (error) {
    throw new Error(getPlaceOrderErrorMessage(error));
  }
};

export const STUDENT_MENU_STATES = Object.freeze([
  MENU_ITEM_STATUS.AVAILABLE,
  MENU_ITEM_STATUS.LIMITED,
  MENU_ITEM_STATUS.SOLD_OUT,
]);
