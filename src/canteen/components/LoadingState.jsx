export function LoadingState({
  title = "Loading",
  description = "Please wait while the canteen console is preparing.",
}) {
  return (
    <div className="canteen-state-card">
      <div className="canteen-spinner" />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
