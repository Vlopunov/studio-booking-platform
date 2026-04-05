"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { StatCard } from "@/components/stat-card";
import { FunnelChart } from "@/components/funnel-chart";
import { api } from "@/lib/api";
import type { CampaignStats } from "@studio/types";

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: campaign, loading } = useApi<any>(`/api/campaigns/${id}`);
  const { data: stats } = useApi<CampaignStats>(`/api/campaigns/${id}/stats`);

  if (loading) return <div className="p-8 text-gray-500">Загрузка...</div>;
  if (!campaign) return <div className="p-8 text-red-500">Кампания не найдена</div>;

  const funnelSteps = stats
    ? [
        { label: "Таргетировано", value: stats.totalTargeted, percentage: 100 },
        {
          label: "Отправлено",
          value: stats.totalSent,
          percentage: stats.deliveryRate,
        },
        {
          label: "Кликнули CTA",
          value: stats.totalClicked,
          percentage: stats.clickRate,
        },
        {
          label: "Забронировали",
          value: stats.totalConverted,
          percentage: stats.conversionRate,
        },
      ]
    : [];

  const handleSend = async () => {
    if (!confirm("Отправить кампанию сейчас?")) return;
    await api.post(`/api/campaigns/${id}/send`, {});
    window.location.reload();
  };

  const handleDelete = async () => {
    if (!confirm("Удалить кампанию?")) return;
    await api.delete(`/api/campaigns/${id}`);
    router.push("/campaigns");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/campaigns")}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            ← Назад к кампаниям
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">
              {campaign.type === "BROADCAST" ? "Рассылка" : campaign.type}
            </span>
            <span className="text-sm px-2 py-0.5 rounded-full bg-gray-100">
              {campaign.status}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          {(campaign.status === "DRAFT" || campaign.status === "SCHEDULED") && (
            <button
              onClick={handleSend}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Отправить сейчас
            </button>
          )}
          {campaign.status !== "SENDING" && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
            >
              Удалить
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Отправлено" value={stats.totalSent} />
            <StatCard
              title="Доставлено"
              value={`${stats.deliveryRate.toFixed(1)}%`}
            />
            <StatCard
              title="Кликнули CTA"
              value={`${stats.clickRate.toFixed(1)}%`}
            />
            <StatCard
              title="Выручка"
              value={`${stats.revenue.toLocaleString("ru-RU")}₽`}
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Воронка конверсии</h2>
            <FunnelChart steps={funnelSteps} />
          </div>
        </>
      )}

      {/* Message preview */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Сообщение</h2>
        <div className="p-4 bg-gray-900 rounded-xl text-white">
          <div className="whitespace-pre-wrap text-sm">{campaign.messageText}</div>
          {campaign.buttonText && (
            <div className="mt-3">
              <span className="inline-block px-4 py-2 bg-blue-500 rounded-lg text-sm">
                {campaign.buttonText}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Deliveries */}
      {campaign.deliveries?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">
            Доставки ({campaign.deliveries.length})
          </h2>
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="pb-3">Клиент</th>
                <th className="pb-3">Статус</th>
                <th className="pb-3">Отправлено</th>
                <th className="pb-3">Клик</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {campaign.deliveries.map((d: any) => (
                <tr key={d.id}>
                  <td className="py-2">
                    {d.client.firstName} {d.client.lastName || ""}
                  </td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2 text-gray-500">
                    {d.sentAt ? new Date(d.sentAt).toLocaleString("ru-RU") : "—"}
                  </td>
                  <td className="py-2 text-gray-500">
                    {d.clickedAt ? new Date(d.clickedAt).toLocaleString("ru-RU") : "—"}
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
