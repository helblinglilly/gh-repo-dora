import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatDate } from "../format";
import { trendLine } from "../metrics/compute";

export interface ChartRow {
  weekStart: number;
  value: number | null;
  /** Shown in the tooltip under the value, e.g. how many items the value is based on. */
  detail: string;
}

interface Props {
  title: string;
  yLabel: string;
  rows: ChartRow[];
  kind: "bar" | "line";
  formatValue: (value: number) => string;
  /** Shown instead of an empty chart when no week has data. */
  emptyHint?: string;
}

interface Datum extends ChartRow {
  label: string;
  trend: number | null;
}

function ChartTooltip({
  active,
  payload,
  formatValue,
}: TooltipContentProps & { formatValue: Props["formatValue"] }) {
  const datum = payload?.[0]?.payload as Datum | undefined;
  if (!active || !datum) return null;
  return (
    <div className="tooltip">
      <strong>Week of {datum.label}</strong>
      <div>{datum.value === null ? "No data" : formatValue(datum.value)}</div>
      <div className="muted">{datum.detail}</div>
    </div>
  );
}

export function MetricChart({
  title,
  yLabel,
  rows,
  kind,
  formatValue,
  emptyHint,
}: Props) {
  if (rows.every((row) => row.value === null)) {
    return (
      <figure className="chart">
        <figcaption>{title}</figcaption>
        <p className="empty muted">No data in this period. {emptyHint ?? ""}</p>
      </figure>
    );
  }

  const trend = trendLine(rows.map((r) => r.value));
  const data: Datum[] = rows.map((row, i) => ({
    ...row,
    label: formatDate(row.weekStart),
    // Every metric here is a count, duration or share, so a fitted line below zero is not meaningful.
    trend: trend[i] === null ? null : Math.max(0, trend[i] as number),
  }));

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 28, left: 16 }}
        >
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--axis)"
            tick={{ fill: "var(--axis)", fontSize: 12 }}
            interval="preserveStartEnd"
            label={{
              value: "Week starting",
              position: "insideBottom",
              offset: -16,
              fill: "var(--axis)",
              fontSize: 12,
            }}
          />
          <YAxis
            domain={[0, "auto"]}
            stroke="var(--axis)"
            tick={{ fill: "var(--axis)", fontSize: 12 }}
            tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              fill: "var(--axis)",
              fontSize: 12,
              dx: -4,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip {...props} formatValue={formatValue} />
            )}
          />
          {kind === "bar" ? (
            <Bar
              dataKey="value"
              fill="var(--series)"
              isAnimationActive={false}
            />
          ) : (
            <Line
              dataKey="value"
              stroke="var(--series)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="trend"
            name="Trend"
            stroke="var(--trend)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend" aria-hidden="true">
        <span className="swatch series" /> Weekly value{" "}
        <span className="swatch trend" /> Trend (least-squares line)
      </div>
    </figure>
  );
}
