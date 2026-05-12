"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatKoreanAmount, formatPercent } from "./AmountFormatter";

interface BudgetChartItem {
  key: string;
  amount: bigint | string;
  percent: number;
}

interface BudgetChartProps {
  data: BudgetChartItem[];
  valueLabel?: string;
}

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
  "#94a3b8",
];

function prepareData(items: BudgetChartItem[]) {
  if (items.length <= 10) {
    return items.map((item) => ({
      name: item.key,
      amount: item.amount,
      percent: item.percent,
    }));
  }
  const top10 = items.slice(0, 10);
  const rest = items.slice(10);
  const restAmount = rest.reduce((acc, item) => {
    const a = typeof item.amount === "bigint" ? item.amount : BigInt(String(item.amount).replace(/[, ]+/g, "") || "0");
    return acc + a;
  }, 0n);
  const restPercent = rest.reduce((acc, item) => acc + item.percent, 0);
  return [
    ...top10.map((item) => ({
      name: item.key,
      amount: item.amount,
      percent: item.percent,
    })),
    {
      name: "기타",
      amount: restAmount.toString(),
      percent: restPercent,
    },
  ];
}

interface TooltipPayloadEntry {
  payload?: { amount: bigint | string; percent: number };
}

function CustomTooltip({
  active,
  payload,
  label,
  valueLabel = "예산",
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  valueLabel?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm max-w-[220px]">
      <p className="font-semibold text-slate-800 mb-1 break-words">{label}</p>
      <p className="text-slate-600">
        {valueLabel}: {formatKoreanAmount(data.amount)}
      </p>
      <p className="text-slate-500">{formatPercent(data.percent)}</p>
    </div>
  );
}

export function BudgetChart({ data, valueLabel = "예산" }: BudgetChartProps) {
  const chartData = prepareData(data);
  const barHeight = 36;
  const chartHeight = Math.max(240, chartData.length * barHeight + 40);

  return (
    <div style={{ width: "100%", height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatKoreanAmount(String(v))}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <Tooltip
            content={
              <CustomTooltip valueLabel={valueLabel} />
            }
          />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
