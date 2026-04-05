"use client";

import { useApi } from "@/lib/hooks";
import { StatCard } from "@/components/stat-card";

export default function MarketingAnalyticsPage() {
  const { data: rfm } = useApi<any[]>("/api/analytics/rfm");
  const { data: ltv } = useApi<any[]>("/api/analytics/ltv?period=6");
  const { data: referrals } = useApi<any>("/api/analytics/referral-stats");
  const { data: campaignRoi } = useApi<any[]>("/api/analytics/campaign-roi");

  const totalRevenue = campaignRoi?.reduce((s, c) => s + c.revenue, 0) || 0;
  const avgConversion =
    campaignRoi && campaignRoi.length > 0
      ? campaignRoi.reduce((s, c) => s + c.conversionRate, 0) / campaignRoi.length
      : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Маркетинговая аналитика</h1>

      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Вирусный коэффициент"
          value={referrals?.viralCoefficient?.toFixed(2) || "—"}
          subtitle="Рефералов на одного пригласившего"
        />
        <StatCard
          title="Ср. конверсия кампаний"
          value={`${avgConversion.toFixed(1)}%`}
        />
        <StatCard
          title="Выручка от кампаний"
          value={`${totalRevenue.toLocaleString("ru-RU")}₽`}
        />
        <StatCard
          title="Всего рефералов"
          value={referrals?.totalReferrals || 0}
          subtitle={`${referrals?.totalReferrers || 0} пригласивших`}
        />
      </div>

      {/* LTV by cohort */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">LTV по когортам</h2>
        <div className="space-y-3">
          {ltv?.map((item) => (
            <div key={item.cohort} className="flex items-center gap-4">
              <span className="w-20 text-sm font-medium">{item.cohort}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-8 relative">
                <div
                  className="bg-gradient-to-r from-blue-400 to-blue-600 h-8 rounded-full flex items-center justify-end pr-3"
                  style={{
                    width: `${Math.min(
                      100,
                      (item.ltv / Math.max(...ltv.map((l: any) => l.ltv), 1)) * 100
                    )}%`,
                  }}
                >
                  <span className="text-white text-xs font-medium">
                    {item.ltv.toLocaleString("ru-RU")}₽
                  </span>
                </div>
              </div>
              <span className="text-sm text-gray-500 w-24 text-right">
                {item.clients} клиентов
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign ROI table */}
      {campaignRoi && campaignRoi.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">ROI кампаний</h2>
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
              {campaignRoi.map((c: any) => (
                <tr key={c.id}>
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3 text-gray-600">{c.sent}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        c.conversionRate >= 10
                          ? "bg-green-100 text-green-700"
                          : c.conversionRate >= 5
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {c.conversionRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 font-semibold">
                    {c.revenue.toLocaleString("ru-RU")}₽
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* NPS placeholder */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Средний рейтинг</h2>
        <p className="text-gray-500 text-sm">
          Трендовый график рейтинга за 6 месяцев (подключить после накопления данных)
        </p>
      </div>
    </div>
  );
}
