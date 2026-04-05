"use client";

import { useApi } from "@/lib/hooks";
import type { RfmStats } from "@studio/types";

const segmentConfig: Record<string, { name: string; emoji: string; color: string; description: string }> = {
  CHAMPIONS: { name: "Чемпионы", emoji: "🏆", color: "bg-yellow-100 border-yellow-300", description: "Часто, недавно, много тратят" },
  LOYAL: { name: "Лояльные", emoji: "❤️", color: "bg-red-100 border-red-300", description: "Часто ходят, средний чек" },
  PROMISING: { name: "Перспективные", emoji: "🌱", color: "bg-green-100 border-green-300", description: "Недавно, мало визитов" },
  NEW: { name: "Новички", emoji: "✨", color: "bg-blue-100 border-blue-300", description: "1-2 визита, недавно" },
  SLEEPING: { name: "Спящие", emoji: "😴", color: "bg-purple-100 border-purple-300", description: "Раньше активны, давно не были" },
  LOST: { name: "Потерянные", emoji: "👋", color: "bg-gray-100 border-gray-300", description: "Давно не были, мало визитов" },
};

export default function RfmPage() {
  const { data: segments, loading } = useApi<RfmStats[]>("/api/analytics/rfm");

  if (loading) return <div className="p-8 text-gray-500">Загрузка...</div>;

  const totalClients = segments?.reduce((s, r) => s + r.count, 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">RFM-анализ</h1>
        <p className="text-gray-500 mt-1">
          Сегментация клиентов по Recency, Frequency, Monetary
        </p>
      </div>

      <div className="text-sm text-gray-500">
        Всего клиентов с сегментом: {totalClients}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {segments?.map((seg) => {
          const config = segmentConfig[seg.segment] || {
            name: seg.segment,
            emoji: "📊",
            color: "bg-gray-100",
            description: "",
          };

          return (
            <div
              key={seg.segment}
              className={`rounded-xl border-2 p-6 ${config.color} cursor-pointer hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{config.emoji}</span>
                <div>
                  <h3 className="font-bold text-lg">{config.name}</h3>
                  <p className="text-xs text-gray-600">{config.description}</p>
                </div>
              </div>

              <div className="text-4xl font-bold mb-2">{seg.count}</div>
              <div className="text-sm text-gray-600 mb-4">
                {seg.percentage.toFixed(1)}% от всех клиентов
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Ср. дней с визита:</span>
                  <span className="font-medium">{seg.avgRecency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ср. визитов (6 мес):</span>
                  <span className="font-medium">{seg.avgFrequency}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
