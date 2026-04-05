"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/hooks";

interface Client {
  id: string;
  name: string;
  phone: string;
  telegram: string;
  tier: string;
  totalBookings: number;
  totalSpent: number;
  lastActivity: string;
  tags: string[];
}

const TIER_BADGES: Record<string, { bg: string; text: string }> = {
  STANDARD: { bg: "bg-gray-100", text: "text-gray-700" },
  SILVER: { bg: "bg-slate-200", text: "text-slate-700" },
  GOLD: { bg: "bg-yellow-100", text: "text-yellow-700" },
  PLATINUM: { bg: "bg-indigo-100", text: "text-indigo-700" },
};

const ALL_TIERS = ["STANDARD", "SILVER", "GOLD", "PLATINUM"];

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tierFilter) params.set("tier", tierFilter);
    if (tagFilter) params.set("tag", tagFilter);
    return params.toString();
  }, [search, tierFilter, tagFilter]);

  const { data: clients, loading } = useApi<Client[]>(
    `/admin/clients?${queryParams}`,
    [queryParams]
  );

  const allTags = useMemo(() => {
    if (!clients) return [];
    const tags = new Set<string>();
    clients.forEach((c) => c.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [clients]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Клиенты</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <input
          type="text"
          placeholder="Поиск по имени, телефону, Telegram..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все уровни</option>
          {ALL_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все теги</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <div className="text-sm text-gray-500 flex items-center">
          {clients ? `Найдено: ${clients.length}` : ""}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Загрузка...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 text-left font-medium text-gray-600">Имя</th>
                <th className="p-3 text-left font-medium text-gray-600">Telegram</th>
                <th className="p-3 text-left font-medium text-gray-600">Уровень</th>
                <th className="p-3 text-right font-medium text-gray-600">Бронирований</th>
                <th className="p-3 text-right font-medium text-gray-600">Потрачено</th>
                <th className="p-3 text-left font-medium text-gray-600">Последняя активность</th>
                <th className="p-3 text-left font-medium text-gray-600">Теги</th>
              </tr>
            </thead>
            <tbody>
              {clients?.map((client) => {
                const tierBadge = TIER_BADGES[client.tier] || TIER_BADGES.STANDARD;
                return (
                  <tr
                    key={client.id}
                    onClick={() => router.push(`/clients/${client.id}`)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-3 font-medium text-gray-900">{client.name}</td>
                    <td className="p-3 text-gray-600">{client.telegram || "—"}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${tierBadge.bg} ${tierBadge.text}`}
                      >
                        {client.tier}
                      </span>
                    </td>
                    <td className="p-3 text-right text-gray-900">{client.totalBookings}</td>
                    <td className="p-3 text-right font-medium text-gray-900">
                      {client.totalSpent.toLocaleString("ru-RU")} ₽
                    </td>
                    <td className="p-3 text-gray-500">
                      {client.lastActivity
                        ? new Date(client.lastActivity).toLocaleDateString("ru-RU")
                        : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {client.tags?.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700"
                          >
                            {tag}
                          </span>
                        ))}
                        {client.tags?.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{client.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {clients?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    Клиенты не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
