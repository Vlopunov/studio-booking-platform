"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import { clsx } from "clsx";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  SENDING: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  SCHEDULED: "Запланирована",
  SENDING: "Отправляется",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
};

export default function CampaignsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const { data, loading, refetch } = useApi<any>(
    `/api/campaigns?page=1&pageSize=50${filter ? `&status=${filter}` : ""}`
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Кампании</h1>
        <button
          onClick={() => router.push("/campaigns/new")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + Создать кампанию
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["", "DRAFT", "SCHEDULED", "SENDING", "COMPLETED"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-medium",
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            )}
          >
            {status ? statusLabels[status] : "Все"}
          </button>
        ))}
      </div>

      <DataTable
        loading={loading}
        columns={[
          { key: "name", header: "Название" },
          {
            key: "type",
            header: "Тип",
            render: (c: any) => (
              <span className="text-sm text-gray-600">
                {c.type === "BROADCAST" ? "Рассылка" : c.type === "SCHEDULED" ? "Запланированная" : "Автоматическая"}
              </span>
            ),
          },
          {
            key: "status",
            header: "Статус",
            render: (c: any) => (
              <span className={clsx("px-2 py-1 rounded-full text-xs font-medium", statusColors[c.status])}>
                {statusLabels[c.status]}
              </span>
            ),
          },
          {
            key: "stats",
            header: "Отправлено / Клики / Конверсии",
            render: (c: any) => (
              <span className="text-sm tabular-nums">
                {c.totalSent} / {c.totalClicked} / {c.totalConverted}
              </span>
            ),
          },
          {
            key: "createdAt",
            header: "Создана",
            render: (c: any) => (
              <span className="text-sm text-gray-500">
                {new Date(c.createdAt).toLocaleDateString("ru-RU")}
              </span>
            ),
          },
        ]}
        data={data?.data || []}
        onRowClick={(c) => router.push(`/campaigns/${c.id}`)}
      />
    </div>
  );
}
