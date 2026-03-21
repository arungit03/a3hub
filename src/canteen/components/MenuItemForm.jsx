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
    <form className="ops-form" onSubmit={handleSubmit}>
      <div className="ops-form-head">
        <div>
          <span className="ops-eyebrow">{item ? "Edit item" : "Create item"}</span>
          <h3>{item ? "Update menu item" : "Add a new ready-made item"}</h3>
        </div>
        {item ? (
          <button className="ghost-button" type="button" onClick={onCancel}>
            Clear
          </button>
        ) : null}
      </div>

      <label className="ops-field">
        <span>Name</span>
        <input
          name="name"
          value={values.name}
          onChange={handleChange}
          placeholder="Paneer Roll"
        />
        {errors.name ? <small>{errors.name}</small> : null}
      </label>

      <label className="ops-field">
        <span>Description</span>
        <textarea
          name="description"
          value={values.description}
          onChange={handleChange}
          rows={3}
          placeholder="Quick description for the counter team and users."
        />
      </label>

      <label className="ops-field">
        <span>Image Upload</span>
        <div className="ops-upload-actions">
          <label className="ghost-button ops-upload-button" htmlFor="canteen-menu-image-upload">
            {hasImage ? "Change image" : "Upload image"}
          </label>
          <input
            id="canteen-menu-image-upload"
            className="ops-file-input"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
          />
          {hasImage ? (
            <button
              className="ghost-button ghost-danger"
              type="button"
              onClick={handleRemoveImage}
            >
              Remove image
            </button>
          ) : null}
        </div>
        {selectedImageName ? (
          <p className="ops-image-preview-note">Selected: {selectedImageName}</p>
        ) : processingImage ? (
          <p className="ops-image-preview-note">Processing image...</p>
        ) : (
          <p className="ops-image-preview-note">
            Choose a local JPG, PNG, WEBP, or GIF up to 5 MB.
          </p>
        )}
        {previewSrc ? (
          <div className="ops-image-preview">
            <RemoteImage
              src={previewSrc}
              alt={values.name || "Menu item preview"}
              className="ops-image-preview-media"
              fallbackClassName="ops-image-preview-media ops-image-preview-fallback"
              fallbackLabel={values.name || "Food"}
            />
          </div>
        ) : null}
        {imageError ? <small>{imageError}</small> : null}
      </label>

      <div className="ops-form-grid">
        <label className="ops-field">
          <span>Price</span>
          <input
            name="price"
            type="number"
            min="0"
            value={values.price}
            onChange={handleChange}
          />
          {errors.price ? <small>{errors.price}</small> : null}
        </label>

        <label className="ops-field">
          <span>Quantity</span>
          <input
            name="quantity"
            type="number"
            min="0"
            value={values.quantity}
            onChange={handleChange}
          />
          {errors.quantity ? <small>{errors.quantity}</small> : null}
        </label>
      </div>

      <div className="ops-form-grid">
        <label className="ops-field">
          <span>Category</span>
          <select name="category" value={values.category} onChange={handleChange}>
            {MENU_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-field">
          <span>Status</span>
          <select name="status" value={values.status} onChange={handleChange}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="ops-toggle">
        <input
          name="visible"
          type="checkbox"
          checked={values.visible}
          onChange={handleChange}
        />
        <span>Visible on the main A3 Hub ordering site</span>
      </label>

      <button
        className="ops-button ops-button-primary"
        type="submit"
        disabled={submitting || processingImage}
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
