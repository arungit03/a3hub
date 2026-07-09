import { useEffect, useMemo, useState } from "react";
import {
  MENU_CATEGORIES,
  MENU_ITEM_STATUS,
} from "../../../shared/types/canteen.js";
import { RemoteImage } from "../../components/RemoteImage.jsx";
import {
  prepareMenuItemImage,
  validateMenuImageFile,
} from "../services/canteenImageUpload.js";
import { validateMenuItemForm } from "../../../shared/utils/validation.js";

const defaultValues = {
  name: "",
  description: "",
  image: "",
  price: "",
  category: MENU_CATEGORIES[0],
  quantity: 0,
  status: MENU_ITEM_STATUS.AVAILABLE,
  visible: true,
};

const fieldLabelClass = "text-sm font-semibold text-ink/80";
const fieldErrorClass = "text-xs font-semibold text-rose-600";
const inputClass =
  "w-full rounded-2xl border border-clay/20 bg-sand/60 px-4 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-ocean focus:outline-none";
const ghostButtonClass =
  "rounded-full border border-clay/20 bg-white px-4 py-2 text-xs font-semibold text-ink/75 transition hover:border-ocean/40 hover:text-ocean";

export function MenuItemForm({
  item = null,
  onSubmit,
  onCancel,
  submitting = false,
}) {
  const [values, setValues] = useState(defaultValues);
  const [errors, setErrors] = useState({});
  const [selectedImageName, setSelectedImageName] = useState("");
  const [imageError, setImageError] = useState("");
  const [processingImage, setProcessingImage] = useState(false);

  useEffect(() => {
    setValues(
      item
        ? {
            name: item.name || "",
            description: item.description || "",
            image: item.image || "",
            price: item.price || "",
            category: item.category || MENU_CATEGORIES[0],
            quantity: item.quantity || 0,
            status: item.status || MENU_ITEM_STATUS.AVAILABLE,
            visible: item.visible !== false,
          }
        : defaultValues
    );
    setErrors({});
    setSelectedImageName("");
    setImageError("");
  }, [item]);

  const statusOptions = useMemo(
    () => [
      MENU_ITEM_STATUS.AVAILABLE,
      MENU_ITEM_STATUS.LIMITED,
      MENU_ITEM_STATUS.SOLD_OUT,
      MENU_ITEM_STATUS.HIDDEN,
    ],
    []
  );

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setValues((currentValues) => ({
      ...currentValues,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleImageChange = async (event) => {
    const nextFile = event.target.files?.[0] || null;
    event.target.value = "";

    if (!nextFile) {
      return;
    }

    setProcessingImage(true);
    try {
      validateMenuImageFile(nextFile);
      const preparedImage = await prepareMenuItemImage(nextFile);
      setValues((currentValues) => ({
        ...currentValues,
        image: preparedImage,
      }));
      setSelectedImageName(nextFile.name);
      setImageError("");
    } catch (error) {
      setSelectedImageName("");
      setImageError(error?.message || "Choose a valid image file.");
    } finally {
      setProcessingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImageName("");
    setImageError("");
    setValues((currentValues) => ({
      ...currentValues,
      image: item?.image || "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const fieldErrors = validateMenuItemForm(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0 || imageError) {
      return;
    }

    await onSubmit(values);
  };

  const previewSrc = values.image || "";
  const hasImage = Boolean(previewSrc);

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ocean">
            {item ? "Edit item" : "Create item"}
          </span>
          <h3 className="mt-1 text-lg font-semibold text-ink">
            {item ? "Update menu item" : "Add a new ready-made item"}
          </h3>
        </div>
        {item ? (
          <button type="button" onClick={onCancel} className={ghostButtonClass}>
            Clear
          </button>
        ) : null}
      </div>

      <label className="grid gap-1.5">
        <span className={fieldLabelClass}>Name</span>
        <input
          name="name"
          value={values.name}
          onChange={handleChange}
          placeholder="Paneer Roll"
          className={inputClass}
        />
        {errors.name ? <small className={fieldErrorClass}>{errors.name}</small> : null}
      </label>

      <label className="grid gap-1.5">
        <span className={fieldLabelClass}>Description</span>
        <textarea
          name="description"
          value={values.description}
          onChange={handleChange}
          rows={3}
          placeholder="Quick description for the counter team and users."
          className={inputClass}
        />
      </label>

      <label className="grid gap-1.5">
        <span className={fieldLabelClass}>Image Upload</span>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor="canteen-menu-image-upload"
            className={`${ghostButtonClass} flex min-h-11 flex-1 cursor-pointer items-center justify-center whitespace-nowrap`}
          >
            {hasImage ? "Change image" : "Upload image"}
          </label>
          <input
            id="canteen-menu-image-upload"
            className="hidden"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
          />
          {hasImage ? (
            <button
              type="button"
              onClick={handleRemoveImage}
              className={`${ghostButtonClass} min-h-11 flex-1 whitespace-nowrap text-rose-600 hover:border-rose-200`}
            >
              Remove image
            </button>
          ) : null}
        </div>
        {selectedImageName ? (
          <p className="text-xs text-ink/55">Selected: {selectedImageName}</p>
        ) : processingImage ? (
          <p className="text-xs text-ink/55">Processing image...</p>
        ) : (
          <p className="wrap-anywhere text-xs text-ink/55">
            Choose a local JPG, PNG, WEBP, or GIF up to 5 MB.
          </p>
        )}
        {previewSrc ? (
          <div className="mt-1.5 grid gap-2.5">
            <RemoteImage
              src={previewSrc}
              alt={values.name || "Menu item preview"}
              className="h-32 w-32 rounded-3xl border border-clay/16 bg-sand object-cover"
              fallbackClassName="h-32 w-32 rounded-3xl border border-clay/16 bg-linear-to-br from-ocean/15 to-aurora/15 flex items-center justify-center text-sm font-bold uppercase tracking-[0.08em] text-ink/60"
              fallbackLabel={values.name || "Food"}
            />
          </div>
        ) : null}
        {imageError ? <small className={fieldErrorClass}>{imageError}</small> : null}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className={fieldLabelClass}>Price</span>
          <input
            name="price"
            type="number"
            min="0"
            value={values.price}
            onChange={handleChange}
            className={inputClass}
          />
          {errors.price ? <small className={fieldErrorClass}>{errors.price}</small> : null}
        </label>

        <label className="grid gap-1.5">
          <span className={fieldLabelClass}>Quantity</span>
          <input
            name="quantity"
            type="number"
            min="0"
            value={values.quantity}
            onChange={handleChange}
            className={inputClass}
          />
          {errors.quantity ? (
            <small className={fieldErrorClass}>{errors.quantity}</small>
          ) : null}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className={fieldLabelClass}>Category</span>
          <select
            name="category"
            value={values.category}
            onChange={handleChange}
            className={inputClass}
          >
            {MENU_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className={fieldLabelClass}>Status</span>
          <select
            name="status"
            value={values.status}
            onChange={handleChange}
            className={inputClass}
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-3 text-sm text-ink/70">
        <input
          name="visible"
          type="checkbox"
          checked={values.visible}
          onChange={handleChange}
          className="h-4 w-4 rounded border-clay/30 text-ocean focus:ring-ocean"
        />
        <span>Visible on the main A3 Hub ordering site</span>
      </label>

      <button
        type="submit"
        disabled={submitting || processingImage}
        className="rounded-full bg-linear-to-r from-ocean to-aurora px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {processingImage
          ? "Processing image..."
          : submitting
            ? "Saving..."
            : item
              ? "Update Item"
              : "Create Item"}
      </button>
    </form>
  );
}
