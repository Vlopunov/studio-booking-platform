"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { DataTable } from "@/components/data-table";
import type { SourceStats } from "@studio/types";

export default function SourcesPage() {
  const [period, setPeriod] = useState(90);
  const { data: sources, loading } = useApi<SourceStats[]>(
    `/api/analytics/sources?period=${period}`,
    [period]
  );

  const totalClients = sources?.reduce((s, r) => s + r.clients, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Источники трафика</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg"
        >
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
          <option value={180}>6 месяцев</option>
          <option value={365}>1 год</option>
        </select>
      </div>

      {/* Pie chart simplified as bars */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Распределение клиентов</h2>
        <div className="space-y-3">
          {sources?.map((s) => {
            const pct = totalClients > 0 ? (s.clients / totalClients) * 100 : 0;
            return (
              <div key={`${s.source}-${s.medium}`}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">
                    {s.source} {s.medium ? `/ ${s.medium}` : ""}
                  </span>
                  <span className="text-gray-500">
                    {s.clients} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4">
                  <div
                    className="bg-blue-500 h-4 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <DataTable
        loading={loading}
        columns={[
          {
            key: "source",
            header: "Источник",
            render: (s: SourceStats) => (
              <span className="font-medium">
                {s.source} {s.medium ? `/ ${s.medium}` : ""}
              </span>
            ),
          },
          { key: "clients", header: "Клиентов" },
          { key: "bookings", header: "Бронирований" },
          {
            key: "conversionRate",
            header: "Конверсия",
            render: (s: SourceStats) => `${s.conversionRate.toFixed(1)}%`,
          },
          {
            key: "avgCheck",
            header: "Ср. чек",
            render: (s: SourceStats) =>
              `${Math.round(s.avgCheck).toLocaleString("ru-RU")}₽`,
          },
          {
            key: "ltv",
            header: "LTV",
            render: (s: SourceStats) =>
              `${Math.round(s.ltv).toLocaleString("ru-RU")}₽`,
          },
        ]}
        data={sources || []}
      />
    </div>
  );
}
