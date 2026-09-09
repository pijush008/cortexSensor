"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { GraphPoint } from "@/types";

interface GraphCardProps {
  title: string;
  subtitle?: string;
  data: GraphPoint[];
  type: "week" | "month" | "year";
  color?: string;
  variant?: "bar" | "area";
}

export function GraphCard({
  title,
  subtitle,
  data,
  type,
  color = "#1f1f1f",
  variant = "area",
}: GraphCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "area" ? (
              <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cfdde9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#667f97" }}
                  tickLine={false}
                  axisLine={{ stroke: "#cfdde9" }}
                  interval={type === "year" ? 1 : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#667f97" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #cfdde9",
                    fontSize: 13,
                  }}
                  cursor={{ stroke: "#7e99b0" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#grad-${title})`}
                  dot={{ r: 2, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cfdde9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#667f97" }}
                  tickLine={false}
                  axisLine={{ stroke: "#cfdde9" }}
                  interval={type === "year" ? 1 : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#667f97" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #cfdde9",
                    fontSize: 13,
                  }}
                  cursor={{ fill: "#f2f3f7" }}
                />
                <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}