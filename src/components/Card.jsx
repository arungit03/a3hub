export default function Card({ children, className = "" }) {
  return <section className={`surface-card ui-card ${className}`}>{children}</section>;
}
