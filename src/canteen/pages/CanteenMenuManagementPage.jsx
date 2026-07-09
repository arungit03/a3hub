import { useMemo, useState } from "react";
import { Package, PackagePlus, PackageX, Search, TriangleAlert } from "lucide-react";
import { useAuth } from "../../state/auth";
import { RemoteImage } from "../../components/RemoteImage.jsx";
import { formatCurrency } from "../../../shared/utils/format.js";
import {
  createMenuItem,
  deleteMenuItem,
  updateMenuItem,
} from "../services/canteenService";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { MenuItemForm } from "../components/MenuItemForm";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { useMenuManagement } from "../hooks/useMenuManagement";

export default function CanteenMenuManagementPage() {
  const { profile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const { items, filteredItems, categories, loading, error } = useMenuManagement({
    search,
    category,
  });

  const summary = useMemo(
    () => ({
      visible: items.filter((item) => item.visible).length,
      lowStock: items.filter((item) => item.status === "limited").length,
      soldOut: items.filter((item) => item.status === "sold_out").length,
    }),
    [items]
  );

  const handleSave = async (values) => {
    setPageError("");
    setSubmitting(true);
    try {
      if (selectedItem) {
        await updateMenuItem(selectedItem.id, values, selectedItem);
      } else {
        await createMenuItem(values, user?.uid || profile?.uid || "");
      }
      setSelectedItem(null);
    } catch (saveError) {
      setPageError(saveError?.message || "Unable to save the menu item.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId) => {
    const confirmed = window.confirm("Delete this menu item?");
    if (!confirmed) return;

    setPageError("");
    try {
      await deleteMenuItem(itemId);
      if (selectedItem?.id === itemId) {
        setSelectedItem(null);
      }
    } catch (deleteError) {
      setPageError(deleteError?.message || "Unable to delete the menu item.");
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Loading menu management"
        description="Syncing every item, quantity change, and visibility toggle."
      />
    );
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean">
              Menu control
            </span>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              Publish ready-made items and adjust live stock
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedItem(null)}
            className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-ocean to-aurora px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
          >
            <PackagePlus className="h-4 w-4" />
            New Item
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total items"
          value={items.length}
          description="All visible and hidden menu records."
          tone="ocean"
          icon={Package}
        />
        <StatCard
          label="Visible now"
          value={summary.visible}
          description="Shown on the student ordering page."
          tone="aurora"
          icon={Package}
        />
        <StatCard
          label="Low stock"
          value={summary.lowStock}
          description="Items running low, restock soon."
          tone="sunset"
          icon={TriangleAlert}
        />
        <StatCard
          label="Sold out"
          value={summary.soldOut}
          description="Out of stock until refilled."
          tone="rose"
          icon={PackageX}
        />
      </section>

      <section className="rounded-[28px] border border-clay/18 bg-white/95 p-5 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex items-center gap-3 rounded-2xl border border-clay/20 bg-sand/60 px-4 py-2.5 text-sm text-ink/70 lg:min-w-80">
            <Search className="h-4 w-4 text-ink/45" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search menu items..."
              className="w-full border-0 bg-transparent p-0 text-sm text-ink placeholder:text-ink/40 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {categories.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  category === option
                    ? "border-ocean/30 bg-ocean/10 text-ocean"
                    : "border-clay/18 bg-white/70 text-ink/70 hover:border-clay/40 hover:text-ink"
                }`}
              >
                {option === "all" ? "All" : option}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error || pageError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error || pageError}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,430px)] xl:items-start">
        <div className="min-w-0">
          {filteredItems.length === 0 ? (
            <EmptyState
              title="No items found"
              description="Try a different search term or add your first ready-made item."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-[24px] border bg-white/95 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.32)] ${
                      isSelected ? "border-ocean/50 ring-2 ring-ocean/25" : "border-clay/16"
                    }`}
                  >
                    <div className="group relative h-32 overflow-hidden bg-sand">
                      <RemoteImage
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        fallbackClassName="flex h-full w-full items-center justify-center bg-linear-to-br from-ocean/15 to-aurora/15 text-sm font-bold uppercase tracking-[0.06em] text-ink/55"
                        fallbackLabel={item.name}
                      />
                      <div className="absolute left-3 top-3">
                        <StatusBadge status={item.status} />
                      </div>
                    </div>

                    <div className="grid gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/50">
                            {item.category || "Uncategorized"}
                          </p>
                          <h3 className="mt-0.5 text-sm font-semibold text-ink">{item.name}</h3>
                        </div>
                        <strong className="shrink-0 text-sm text-ink">
                          {formatCurrency(item.price)}
                        </strong>
                      </div>

                      <p className="line-clamp-2 text-xs text-ink/55">
                        {item.description || "No description"}
                      </p>

                      <div className="flex items-center justify-between border-t border-clay/12 pt-2.5 text-xs text-ink/60">
                        <span>{item.quantity} in stock</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="rounded-full border border-clay/20 bg-white px-3 py-1.5 text-xs font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ocean"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-[28px] border border-clay/18 bg-white/95 p-6 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.16)] xl:sticky xl:top-6">
          <MenuItemForm
            item={selectedItem}
            submitting={submitting}
            onCancel={() => setSelectedItem(null)}
            onSubmit={handleSave}
          />
        </div>
      </section>
    </div>
  );
}
