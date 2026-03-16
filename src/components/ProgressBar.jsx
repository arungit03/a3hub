export default function ProgressBar({ value }) {
  return (
    <div className="h-2 w-full rounded-full bg-cream">
      <div
        className="h-2 rounded-full bg-gradient-to-r from-clay via-aurora to-ocean"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

