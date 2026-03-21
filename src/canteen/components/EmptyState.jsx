export function EmptyState({ title, description, action = null }) {
  return (
    <div className="canteen-state-card">
      <div className="canteen-empty-mark">A3</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
