import { useMemo, useState } from "react";
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

  const visibleItems = useMemo(() => items.filter((item) => item.visible).length, [items]);

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
    <div className="ops-page-stack">
      <section className="ops-card">
        <div className="ops-section-head">
          <div>
            <span className="ops-eyebrow">Menu control</span>
            <h2>Publish ready-made items and adjust live stock</h2>
          </div>
          <div className="ops-inline ops-muted">
            <strong>{items.length}</strong>
            <span>total items</span>
            <strong>{visibleItems}</strong>
            <span>visible</span>
          </div>
        </div>

        <div className="ops-toolbar">
          <input
            className="ops-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search menu items..."
          />
          <select
            className="ops-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All categories" : option}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error || pageError ? (
        <div className="ops-message ops-message-error">{error || pageError}</div>
      ) : null}

      <section className="ops-two-col ops-two-col-wide ops-menu-layout">
        <div className="ops-card ops-menu-table-card">
          {filteredItems.length === 0 ? (
            <EmptyState
              title="No items found"
              description="Try a different search term or add your first ready-made item."
            />
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="ops-item-cell">
                          <RemoteImage
                            src={item.image}
                            alt={item.name}
                            className="ops-item-thumb"
                            fallbackClassName="ops-item-thumb ops-item-thumb-fallback"
                            fallbackLabel={item.name}
                          />
                          <div>
                            <strong>{item.name}</strong>
                            <p>{item.description || "No description"}</p>
                          </div>
                        </div>
                      </td>
                      <td>{item.category}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td>{item.quantity}</td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        <div className="ops-inline">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => setSelectedItem(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="ghost-button ghost-danger"
                            type="button"
                            onClick={() => handleDelete(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ops-card ops-menu-form-card">
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
