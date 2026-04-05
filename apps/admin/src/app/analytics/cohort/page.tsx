"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import type { CohortRetention } from "@studio/types";
import { clsx } from "clsx";

export default function CohortPage() {
  const [months, setMonths] = useState(6);
  const { data: cohorts, loading } = useApi<CohortRetention[]>(
    `/api/analytics/cohort-retention?months=${months}`,
    [months]
  );

  if (loading) return <div className="p-8 text-gray-500">Загрузка...</div>;

  const maxMonths = Math.max(...(cohorts?.map((c) => c.months.length) || [0]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cohort Retention</h1>
          <p className="text-gray-500 mt-1">Удержание клиентов по когортам</p>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg"
        >
          <option value={3}>3 месяца</option>
          <option value={6}>6 месяцев</option>
          <option value={12}>12 месяцев</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Когорта
              </th>
              {Array.from({ length: maxMonths }, (_, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"
                >
                  M{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {cohorts?.map((cohort) => (
              <tr key={cohort.cohort}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {cohort.cohort}
                </td>
                {Array.from({ length: maxMonths }, (_, i) => {
                  const value = cohort.months[i];
                  return (
                    <td
                      key={i}
                      className={clsx(
                        "px-4 py-3 text-center text-sm font-medium",
                        value === null
                          ? "text-gray-300"
                          : getRetentionColor(value)
                      )}
                    >
                      {value !== null ? `${value}%` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getRetentionColor(value: number): string {
  if (value >= 80) return "bg-green-100 text-green-800";
  if (value >= 50) return "bg-green-50 text-green-700";
  if (value >= 30) return "bg-yellow-50 text-yellow-700";
  if (value >= 15) return "bg-orange-50 text-orange-700";
  return "bg-red-50 text-red-700";
}
