"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { DataTable } from "@/components/data-table";
import { StatCard } from "@/components/stat-card";
import { api } from "@/lib/api";
import { clsx } from "clsx";

export default function GiftCertificatesPage() {
  const [filter, setFilter] = useState("");
  const { data, loading, error, refetch } = useApi<any>(
    `/api/gift-certificates?page=1&pageSize=50${filter ? `&status=${filter}` : ""}`
  );
  const { data: stats } = useApi<any>("/api/gift-certificates/stats/summary");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    type: "AMOUNT" as "AMOUNT" | "HOURS",
    value: 5000,
    recipientName: "",
    message: "",
  });

  const handleCreate = async () => {
    await api.post("/api/gift-certificates", createForm);
    setShowCreate(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Подарочные сертификаты
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + Создать сертификат
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Всего продано" value={stats.totalSold} />
          <StatCard title="Использовано" value={stats.totalRedeemed} />
          <StatCard title="Активных" value={stats.totalActive} />
          <StatCard
            title="Выручка"
            value={`${stats.totalRevenue.toLocaleString("ru-RU")}₽`}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { value: "", label: "Все" },
          { value: "active", label: "Активные" },
          { value: "redeemed", label: "Использованные" },
          { value: "expired", label: "Просроченные" },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-medium",
              filter === value
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border hover:bg-gray-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-12 text-center text-red-500 bg-white rounded-xl border border-gray-200">
          <p className="font-medium">Ошибка загрузки</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <DataTable
        loading={loading}
        columns={[
          { key: "code", header: "Код", render: (c: any) => <code className="text-sm">{c.code}</code> },
          {
            key: "type",
            header: "Тип",
            render: (c: any) => c.type === "HOURS" ? "Часы" : "Сумма",
          },
          {
            key: "value",
            header: "Номинал",
            render: (c: any) =>
              c.type === "HOURS"
                ? `${Number(c.value)} ч.`
                : `${Number(c.value).toLocaleString("ru-RU")}₽`,
          },
          {
            key: "purchasedBy",
            header: "Покупатель",
            render: (c: any) =>
              c.purchasedBy
                ? `${c.purchasedBy.firstName} ${c.purchasedBy.lastName || ""}`
                : "Студия",
          },
          {
            key: "redeemedBy",
            header: "Использовал",
            render: (c: any) =>
              c.redeemedBy
                ? `${c.redeemedBy.firstName} ${c.redeemedBy.lastName || ""}`
                : "—",
          },
          {
            key: "expiresAt",
            header: "Истекает",
            render: (c: any) => new Date(c.expiresAt).toLocaleDateString("ru-RU"),
          },
          {
            key: "status",
            header: "Статус",
            render: (c: any) => {
              if (c.redeemedAt) return <span className="text-green-600">Использован</span>;
              if (new Date(c.expiresAt) < new Date()) return <span className="text-red-600">Просрочен</span>;
              if (!c.isActive) return <span className="text-gray-400">Деактивирован</span>;
              return <span className="text-blue-600">Активен</span>;
            },
          },
        ]}
        data={data?.data || []}
      />

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Новый сертификат</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Тип</label>
              <select
                value={createForm.type}
                onChange={(e) =>
                  setCreateForm({ ...createForm, type: e.target.value as any })
                }
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="AMOUNT">На сумму</option>
                <option value="HOURS">На часы</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {createForm.type === "HOURS" ? "Количество часов" : "Сумма (₽)"}
              </label>
              <input
                type="number"
                value={createForm.value}
                onChange={(e) =>
                  setCreateForm({ ...createForm, value: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Имя получателя (опционально)
              </label>
              <input
                type="text"
                value={createForm.recipientName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, recipientName: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
