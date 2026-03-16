import { toPercent } from "../lib/format";

const CHART_WIDTH = 680;
const CHART_HEIGHT = 220;
const PADDING = 20;

const toChartValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function AdminLineChart({ title, subtitle, points = [] }) {
  const safePoints = Array.isArray(points) ? points : [];
  const values = safePoints.map((item) => toChartValue(item?.value));
  const maxValue = Math.max(100, ...values, 1);
  const divisor = safePoints.length > 1 ? safePoints.length - 1 : 1;
  const innerWidth = CHART_WIDTH - PADDING * 2;
  const innerHeight = CHART_HEIGHT - PADDING * 2;

  const chartPoints = safePoints.map((item, index) => {
    const value = toChartValue(item?.value);
    const x = PADDING + (index / divisor) * innerWidth;
    const y = PADDING + innerHeight - (value / maxValue) * innerHeight;
    return {
      x,
      y,
      label: item?.label || "-",
      value,
    };
  });

  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = chartPoints.length
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${CHART_HEIGHT - PADDING} L ${chartPoints[0].x} ${CHART_HEIGHT - PADDING} Z`
    : "";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>

      {chartPoints.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="h-[220px] min-w-[640px] w-full"
              role="img"
              aria-label={title}
            >
              <defs>
                <linearGradient id="adminChartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(37, 99, 235, 0.35)" />
                  <stop offset="100%" stopColor="rgba(37, 99, 235, 0.02)" />
                </linearGradient>
              </defs>

              <line
                x1={PADDING}
                y1={CHART_HEIGHT - PADDING}
                x2={CHART_WIDTH - PADDING}
                y2={CHART_HEIGHT - PADDING}
                stroke="rgba(148, 163, 184, 0.6)"
              />
              <line
                x1={PADDING}
                y1={PADDING}
                x2={PADDING}
                y2={CHART_HEIGHT - PADDING}
                stroke="rgba(148, 163, 184, 0.6)"
              />

              <path d={areaPath} fill="url(#adminChartFill)" />
              <path
                d={linePath}
                fill="none"
                stroke="rgb(37, 99, 235)"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {chartPoints.map((point, index) => (
                <g key={`${point.label}-${index}`}>
                  <circle cx={point.x} cy={point.y} r="4" fill="rgb(30, 64, 175)" />
                  <text
                    x={point.x}
                    y={CHART_HEIGHT - 2}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgb(71, 85, 105)"
                  >
                    {point.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {chartPoints.map((point, index) => (
              <span
                key={`${point.label}-chip-${index}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600"
              >
                {point.label}: {toPercent(point.value)}%
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">No trend data available.</p>
      )}
    </section>
  );
}
