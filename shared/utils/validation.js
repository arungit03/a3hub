import {
  MENU_ITEM_STATUS,
  ORDER_STATUS,
  normalizeText,
  toInteger,
  toNumber,
} from "../types/canteen";

export const validateLoginForm = ({ email, password }) => {
  const errors = {};
  if (!normalizeText(email)) {
    errors.email = "Email is required.";
  }
  if (!normalizeText(password)) {
    errors.password = "Password is required.";
  }
  return errors;
};

export const validateMenuItemForm = (values = {}) => {
  const errors = {};
  const quantity = Number(values.quantity);
  const price = Number(values.price);
  const status = normalizeText(values.status).toLowerCase();

  if (!normalizeText(values.name)) {
    errors.name = "Item name is required.";
  }
  if (!normalizeText(values.category)) {
    errors.category = "Category is required.";
  }
  if (!Number.isFinite(price) || price <= 0) {
    errors.price = "Price should be greater than zero.";
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    errors.quantity = "Quantity cannot be negative.";
  }
  if (
    status &&
    !Object.values(MENU_ITEM_STATUS).includes(status)
  ) {
    errors.status = "Select a valid status.";
  }

  return errors;
};

export const validateOrderStatus = (status) =>
  Object.values(ORDER_STATUS).includes(normalizeText(status).toLowerCase());

export const validateCheckoutItems = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "Add at least one item before checkout.";
  }

  const invalidItem = items.find(
    (item) =>
      !normalizeText(item?.id) ||
      !normalizeText(item?.name) ||
      toNumber(item?.price) <= 0 ||
      toInteger(item?.quantity) <= 0
  );

  return invalidItem ? "One or more cart items are invalid." : "";
};
