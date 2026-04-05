"use client";

import { useApi } from "@/lib/hooks";
import { StatCard } from "@/components/stat-card";
import type { RfmStats, CohortRetention } from "@studio/types";

export default function DashboardPage() {
  const { data: rfm } = useApi<RfmStats[]>("/api/analytics/rfm");
  const { data: referrals } = useApi<any>("/api/analytics/referral-stats");
  const { data: campaigns } = useApi<any>("/api/analytics/campaign-roi");
  const { data: giftStats } = useApi<any>("/api/gift-certificates/stats/summary");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Маркетинговый дашборд
      </h1>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Вирусный коэффициент"
          value={referrals?.viralCoefficient?.toFixed(2) || "—"}
          subtitle={`${referrals?.totalReferrals || 0} рефералов`}
        />
        <StatCard
          title="Всего кампаний"
          value={campaigns?.length || 0}
          subtitle="Завершённых"
        />
        <StatCard
          title="Сертификаты"
          value={giftStats?.totalSold || 0}
          subtitle={`Активных: ${giftStats?.totalActive || 0}`}
        />
        <StatCard
          title="Использовано сертификатов"
          value={`${giftStats?.redemptionRate?.toFixed(1) || 0}%`}
          subtitle={`${giftStats?.totalRedeemed || 0} ��з ${giftStats?.totalSold || 0}`}
        />
      </div>

      {/* RFM Segments */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          RFM-сегментация клиентов
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {rfm?.map((segment) => (
            <div
              key={segment.segment}
              className="text-center p-4 rounded-lg bg-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <div className="text-2xl mb-1">{getSegmentEmoji(segment.segment)}</div>
              <div className="font-medium text-sm">{getSegmentName(segment.segment)}</div>
              <div className="text-2xl font-bold text-gray-900">{segment.count}</div>
              <div className="text-xs text-gray-500">{segment.percentage.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top referrers */}
      {referrals?.topReferrers?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Топ рефералы
          </h2>
          <div className="space-y-3">
            {referrals.topReferrers.slice(0, 5).map((r: any, idx: number) => (
              <div key={r.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400 w-6">
                    {idx + 1}
                  </span>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm text-gray-500">({r.code})</span>
                </div>
                <span className="font-semibold">{r.referrals} приглашений</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign ROI */}
      {campaigns?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Э��фективность кампаний
          </h2>
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="pb-3">Кампания</th>
                <th className="pb-3">Отправлено</th>
                <th className="pb-3">Конверсия</th>
                <th className="pb-3">Выручка</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c: any) => (
                <tr key={c.id}>
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3">{c.sent}</td>
                  <td className="py-3">{c.conversionRate.toFixed(1)}%</td>
                  <td className="py-3 font-semibold">
                    {c.revenue.toLocaleString("ru-RU")}₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function getSegmentEmoji(segment: string): string {
  const map: Record<string, string> = {
    CHAMPIONS: "🏆",
    LOYAL: "❤️",
    PROMISING: "🌱",
    NEW: "✨",
    SLEEPING: "😴",
    LOST: "👋",
  };
  return map[segment] || "📊";
}

function getSegmentName(segment: string): string {
  const map: Record<string, string> = {
    CHAMPIONS: "Чемпионы",
    LOYAL: "Лояльные",
    PROMISING: "Перспективные",
    NEW: "Новички",
    SLEEPING: "Спящие",
    LOST: "Потерянные",
  };
  return map[segment] || segment;
}
