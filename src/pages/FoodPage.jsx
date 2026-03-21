import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingBag, ReceiptText, UtensilsCrossed } from "lucide-react";
import { RemoteImage } from "../components/RemoteImage.jsx";
import { useAuth } from "../state/auth";
import { useToast } from "../hooks/useToast";
import {
  calculateCartCount,
  calculateCartTotal,
} from "../../shared/utils/canteen.js";
import {
  formatCurrency,
  formatDateTime,
  formatQuantityHint,
  formatToken,
} from "../../shared/utils/format.js";
import {
  buildOrderRecord,
  isMenuItemOrderable,
  normalizeText,
} from "../../shared/types/canteen.js";
import {
  listenOrdersForStudent,
  listenVisibleMenuItems,
  placeOrder,
} from "../../shared/firebase/canteen.js";

const CART_STORAGE_PREFIX = "a3hub.canteen.cart";

const readStoredCart = (userId) => {
  if (typeof window === "undefined" || !userId) return [];

  try {
    const raw = window.localStorage.getItem(`${CART_STORAGE_PREFIX}.${userId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredCart = (userId, items) => {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(
      `${CART_STORAGE_PREFIX}.${userId}`,
      JSON.stringify(Array.isArray(items) ? items : [])
    );
  } catch {
    // Best effort only.
  }
};

const toCartItem = (item, quantity = 1) => ({
  id: item.id,
  name: item.name,
  image: item.image,
  category: item.category,
  price: Number(item.price) || 0,
  quantity,
  availableQuantity: Number(item.quantity) || 0,
  status: item.status || "available",
});

const getStatusTone = (status, quantity = 0) => {
  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "collected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "sold_out" || quantity <= 0) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "limited" || quantity <= 5) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-sky-200 bg-sky-50 text-sky-700";
};

const StatusBadge = ({ status, quantity, order = false }) => (
  <span
    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(
      status,
      quantity
    )}`}
  >
    {order
      ? normalizeText(status) || "placed"
      : formatQuantityHint(quantity, status)}
  </span>
);

const pageShellClass =
  "relative overflow-hidden rounded-[36px] border border-clay/24 bg-gradient-to-br from-white via-[#fbfdff] to-[#f1f7fc] p-4 shadow-[0_30px_80px_-52px_rgba(15,23,42,0.2)] sm:p-6";
const surfaceClass =
  "rounded-[28px] border border-clay/18 bg-white/95 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]";
const softSurfaceClass = "rounded-2xl border border-clay/14 bg-[#f7fafc]";
const eyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600";
const mutedTextClass = "text-ink/70";
const strongButtonClass =
  "rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
const quantityControlClass =
  "inline-flex items-center rounded-full border border-clay/18 bg-white shadow-[0_10px_24px_-20px_rgba(15,23,42,0.3)]";

export default function FoodPage({ forcedRole }) {
  const { user, profile, role } = useAuth();
  const toast = useToast();
  const effectiveRole = forcedRole || role || "student";
  const [activeTab, setActiveTab] = useState("menu");
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cartItems, setCartItems] = useState(() => readStoredCart(user?.uid));

  useEffect(() => {
    setCartItems(readStoredCart(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    writeStoredCart(user?.uid, cartItems);
  }, [cartItems, user?.uid]);

  useEffect(() => {
    const unsubscribe = listenVisibleMenuItems(
      (items) => {
        setMenuItems(items);
        setMenuLoading(false);
        setPageError("");
      },
      (error) => {
        setMenuLoading(false);
        setPageError(error?.message || "Unable to load food items.");
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setOrders([]);
      setOrdersLoading(false);
      return undefined;
    }

    const unsubscribe = listenOrdersForStudent(
      user.uid,
      (nextOrders) => {
        setOrders(nextOrders.map((item) => buildOrderRecord(item.id, item)));
        setOrdersLoading(false);
        setPageError("");
      },
      (error) => {
        setOrdersLoading(false);
        setPageError(error?.message || "Unable to load your food orders.");
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    const inventoryMap = new Map(menuItems.map((item) => [item.id, item]));
    setCartItems((currentItems) =>
      currentItems.flatMap((item) => {
        const latestItem = inventoryMap.get(item.id);
        if (!latestItem || !isMenuItemOrderable(latestItem)) {
          return [];
        }

        const nextQuantity = Math.min(item.quantity, latestItem.quantity);
        if (nextQuantity <= 0) {
          return [];
        }

        return [toCartItem(latestItem, nextQuantity)];
      })
    );
  }, [menuItems]);

  const categoryOptions = useMemo(
    () => ["all", ...Array.from(new Set(menuItems.map((item) => item.category).filter(Boolean)))],
    [menuItems]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeText(search).toLowerCase();
    return menuItems.filter((item) => {
      const matchesCategory =
        category === "all" || normalizeText(item.category).toLowerCase() === category;
      const haystack = [item.name, item.description, item.category]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [category, menuItems, search]);

  const cartMap = useMemo(
    () => new Map(cartItems.map((item) => [item.id, item])),
    [cartItems]
  );

  const totalItems = calculateCartCount(cartItems);
  const totalAmount = calculateCartTotal(cartItems);
  const openOrdersCount = orders.filter((item) => item.status === "placed").length;

  const addToCart = (item) => {
    if (!isMenuItemOrderable(item)) return;

    setCartItems((currentItems) => {
      const existing = currentItems.find((entry) => entry.id === item.id);
      const nextQuantity = Math.min(
        Number(item.quantity) || 0,
        (existing?.quantity || 0) + 1
      );

      if (existing) {
        return currentItems.map((entry) =>
          entry.id === item.id ? toCartItem(item, nextQuantity) : entry
        );
      }

      return [...currentItems, toCartItem(item, 1)];
    });

    toast.success?.(`${item.name} added to cart.`);
  };

  const updateCartQuantity = (itemId, nextQuantity) => {
    setCartItems((currentItems) =>
      currentItems.flatMap((item) => {
        if (item.id !== itemId) return [item];
        const latestItem = menuItems.find((entry) => entry.id === itemId) || item;
        const maxQuantity = Math.max(0, Number(latestItem.quantity) || 0);
        const safeQuantity = Math.max(0, Math.min(Number(nextQuantity) || 0, maxQuantity));
        return safeQuantity > 0 ? [toCartItem(latestItem, safeQuantity)] : [];
      })
    );
  };

  const placeCurrentOrder = async () => {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      toast.error?.("Add at least one food item before placing the order.");
      return;
    }

    setPlacingOrder(true);
    setPageError("");
    try {
      const result = await placeOrder(cartItems);
      setSuccessOrder(result);
      setCartItems([]);
      setActiveTab("orders");
      toast.success?.(`Order placed. Token ${result.tokenNumber}.`);
    } catch (error) {
      const message =
        error?.message || "Unable to place the food order right now.";
      setPageError(message);
      toast.error?.(message);
    } finally {
      setPlacingOrder(false);
    }
  };

  const headingLabel =
    effectiveRole === "staff" ? "Staff food ordering" : "Campus food ordering";

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 text-ink">
      <div className={pageShellClass}>
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-emerald-400/12 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-6">
          <section className={`${surfaceClass} overflow-hidden p-6 sm:p-8`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className={eyebrowClass}>A3 Hub Food Desk</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  {headingLabel}
                </h1>
                <p className={`mt-3 max-w-2xl text-sm sm:text-base ${mutedTextClass}`}>
                  Ready-made food only. Browse what is currently available, add items to
                  cart, place your order, and collect using your token number.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className={`${softSurfaceClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
                    Visible Items
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-ink">{menuItems.length}</p>
                </div>
                <div className={`${softSurfaceClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
                    Cart Items
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-ink">{totalItems}</p>
                </div>
                <div className={`${softSurfaceClass} px-4 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">
                    Open Orders
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-ink">{openOrdersCount}</p>
                </div>
              </div>
            </div>
          </section>

          {successOrder ? (
            <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Order placed
                  </p>
                  <p className="mt-1 text-sm">
                    Token <span className="font-bold">{formatToken(successOrder.tokenNumber)}</span>
                    {" "}is ready. Show this at the canteen counter.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessOrder(null)}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  Dismiss
                </button>
              </div>
            </section>
          ) : null}

          {pageError ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {pageError}
            </section>
          ) : null}

          <section className="flex flex-wrap gap-2">
            {[
              { id: "menu", label: "Menu", icon: UtensilsCrossed },
              { id: "cart", label: `Cart (${totalItems})`, icon: ShoppingBag },
              { id: "orders", label: "My Orders", icon: ReceiptText },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-sky-200 bg-sky-50 text-sky-700 shadow-[0_12px_28px_-22px_rgba(14,165,233,0.8)]"
                      : "border-clay/18 bg-white/75 text-ink/70 hover:border-clay/40 hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </section>

          {activeTab === "menu" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="grid gap-5">
                <div className={`${surfaceClass} p-4`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <label className="flex items-center gap-3 rounded-2xl border border-clay/20 bg-sand px-4 py-3 text-sm text-ink/70 lg:min-w-[340px]">
                      <Search className="h-4 w-4 text-ink/50" />
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search food, drinks, snacks..."
                        className="w-full border-0 bg-transparent p-0 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {categoryOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCategory(item)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            category === item
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-clay/18 bg-white/70 text-ink/70 hover:border-clay/40 hover:text-ink"
                          }`}
                        >
                          {item === "all" ? "All" : item}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {menuLoading ? (
                  <div className={`${surfaceClass} p-8 text-sm ${mutedTextClass}`}>
                    Loading food items...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className={`${surfaceClass} p-8 text-sm ${mutedTextClass}`}>
                    No food items match your current filter.
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredItems.map((item) => {
                      const cartItem = cartMap.get(item.id);
                      const disabled = !isMenuItemOrderable(item);
                      return (
                        <article
                          key={item.id}
                          className={`${surfaceClass} overflow-hidden`}
                        >
                          <div className="relative h-48 bg-sand">
                            <RemoteImage
                              src={item.image}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              fallbackClassName="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 via-white to-emerald-100 text-2xl font-semibold text-ink/55"
                              fallbackLabel={item.name}
                              fallbackLabelClassName="tracking-[0.08em]"
                            />
                            <div className="absolute left-4 top-4">
                              <StatusBadge status={item.status} quantity={item.quantity} />
                            </div>
                          </div>

                          <div className="grid gap-4 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">
                                  {item.category || "Food"}
                                </p>
                                <h2 className="mt-1 text-lg font-semibold text-ink">
                                  {item.name}
                                </h2>
                              </div>
                              <span className="text-base font-bold text-ink">
                                {formatCurrency(item.price)}
                              </span>
                            </div>

                            <p className={`text-sm ${mutedTextClass}`}>
                              {item.description || "Freshly prepared and ready for pickup."}
                            </p>

                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold text-ink/60">
                                {formatQuantityHint(item.quantity, item.status)}
                              </span>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => addToCart(item)}
                                className={strongButtonClass}
                              >
                                {disabled
                                  ? "Unavailable"
                                  : cartItem
                                    ? `Add More (${cartItem.quantity})`
                                    : "Add to Cart"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <aside className={`${surfaceClass} h-fit p-5 xl:sticky xl:top-24`}>
                <p className={eyebrowClass}>Quick Cart</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  {profile?.name || user?.email || "Campus user"}
                </h2>
                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  Review what you are about to collect from the canteen counter.
                </p>

                <div className="mt-5 space-y-3">
                  {cartItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-clay/28 bg-sand/60 px-4 py-6 text-sm text-ink/60">
                      Your cart is empty.
                    </div>
                  ) : (
                    cartItems.map((item) => (
                      <div
                        key={item.id}
                        className={`${softSurfaceClass} px-4 py-3`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{item.name}</p>
                            <p className="text-xs text-ink/60">{item.category}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.id, 0)}
                            className="text-xs font-semibold text-rose-600"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className={quantityControlClass}>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                              className="px-3 py-1.5 text-sm font-semibold text-ink/75"
                            >
                              -
                            </button>
                            <span className="min-w-10 text-center text-sm font-semibold text-ink">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                              className="px-3 py-1.5 text-sm font-semibold text-ink/75"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-sm font-bold text-ink">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-emerald-50 px-4 py-4 text-ink">
                  <div className="flex items-center justify-between text-sm">
                    <span>Total items</span>
                    <span>{totalItems}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-base font-semibold">
                    <span>Total amount</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={placeCurrentOrder}
                  disabled={placingOrder || cartItems.length === 0}
                  className={`mt-5 w-full ${strongButtonClass}`}
                >
                  {placingOrder ? "Placing Order..." : "Place Food Order"}
                </button>
              </aside>
            </div>
          ) : null}

      {activeTab === "cart" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={`${surfaceClass} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={eyebrowClass}>Cart</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  Review your ready-made food order
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {cartItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-clay/28 bg-sand/60 px-4 py-8 text-sm text-ink/60">
                  Your cart is empty. Add items from the menu first.
                </div>
              ) : (
                cartItems.map((item) => (
                  <article
                    key={item.id}
                    className="grid gap-4 rounded-3xl border border-clay/18 bg-sand/55 p-4 md:grid-cols-[96px_minmax(0,1fr)]"
                  >
                    <div className="h-24 overflow-hidden rounded-2xl bg-sand">
                      <RemoteImage
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        fallbackClassName="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 via-white to-emerald-100 text-sm font-semibold text-ink/55"
                        fallbackLabel={item.name}
                        fallbackLabelClassName="tracking-[0.08em]"
                      />
                    </div>
                    <div className="grid gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-ink">{item.name}</h3>
                          <p className="text-sm text-ink/60">{item.category}</p>
                        </div>
                        <StatusBadge status={item.status} quantity={item.availableQuantity} />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className={quantityControlClass}>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                            className="px-3 py-1.5 text-sm font-semibold text-ink/75"
                          >
                            -
                          </button>
                          <span className="min-w-10 text-center text-sm font-semibold text-ink">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                            className="px-3 py-1.5 text-sm font-semibold text-ink/75"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-sm font-bold text-ink">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.id, 0)}
                            className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <aside className={`${surfaceClass} h-fit p-5 xl:sticky xl:top-24`}>
            <p className={eyebrowClass}>Checkout Summary</p>
            <div className={`mt-4 space-y-3 text-sm ${mutedTextClass}`}>
              <div className="flex items-center justify-between">
                <span>Items</span>
                <span>{totalItems}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Total</span>
                <span className="text-base font-bold text-ink">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={placeCurrentOrder}
              disabled={placingOrder || cartItems.length === 0}
              className={`mt-5 w-full ${strongButtonClass}`}
            >
              {placingOrder ? "Placing Order..." : "Confirm Order"}
            </button>
          </aside>
        </section>
      ) : null}

      {activeTab === "orders" ? (
        <section className={`${surfaceClass} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={eyebrowClass}>Order History</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Your food tokens and order status
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {ordersLoading ? (
              <div className="rounded-2xl border border-clay/18 bg-sand/55 px-4 py-8 text-sm text-ink/60">
                Loading your orders...
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-clay/28 bg-sand/60 px-4 py-8 text-sm text-ink/60">
                No food orders yet.
              </div>
            ) : (
              orders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-3xl border border-clay/18 bg-sand/55 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
                        Token {formatToken(order.tokenNumber)}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">
                        {formatDateTime(order.createdAt)}
                      </h3>
                      <p className="mt-1 text-sm text-ink/60">
                        Order ID: {order.id}
                      </p>
                    </div>
                    <StatusBadge status={order.status} quantity={1} order />
                  </div>

                  <div className="mt-4 space-y-2">
                    {(Array.isArray(order.items) ? order.items : []).map((item) => (
                      <div
                        key={`${order.id}-${item.menuItemId || item.name}`}
                        className="flex items-center justify-between gap-3 text-sm text-ink/75"
                      >
                        <span>
                          {item.name} x{item.quantity}
                        </span>
                        <span className="font-semibold text-ink">
                          {formatCurrency(item.lineTotal || item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-clay/18 pt-3 text-sm">
                    <span className="text-ink/60">
                      {order.itemCount || order.items?.length || 0} item(s)
                    </span>
                    <span className="font-bold text-ink">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
        </div>
      </div>
    </div>
  );
}
