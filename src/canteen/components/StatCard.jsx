export function StatCard({ label, value, description }) {
  return (
    <article className="ops-stat-card">
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{description}</p>
    </article>
  );
}
