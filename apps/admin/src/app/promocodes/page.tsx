"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface Promocode {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED" | "BONUS";
  value: number;
  usedCount: number;
  maxUses: number | null;
  validFrom: string;
  validTo: string;
  venueId: string | null;
  venueName: string | null;
  isActive: boolean;
  totalDiscountGiven: number;
}

interface Venue {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "Процент",
  FIXED: "Фиксированная",
  BONUS: "Бонусы",
};

export default function PromocodesPage() {
  const { data: promocodes, loading, refetch } = useApi<Promocode[]>(
    "/admin/promocodes"
  );
  const { data: venues } = useApi<Venue[]>("/admin/venues");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: "",
    type: "PERCENTAGE" as "PERCENTAGE" | "FIXED" | "BONUS",
    value: 0,
    maxUses: "",
    validFrom: "",
    validTo: "",
    venueId: "",
  });

  const createPromocode = async () => {
    setSaving(true);
    try {
      await api.post("/admin/promocodes", {
        ...form,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        venueId: form.venueId || null,
      });
      setCreating(false);
      setForm({
        code: "",
        type: "PERCENTAGE",
        value: 0,
        maxUses: "",
        validFrom: "",
        validTo: "",
        venueId: "",
      });
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/admin/promocodes/${id}`, { isActive: !isActive });
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Промокоды</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Создать промокод
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Загрузка...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 text-left font-medium text-gray-600">Код</th>
                <th className="p-3 text-left font-medium text-gray-600">Тип</th>
                <th className="p-3 text-right font-medium text-gray-600">Значение</th>
                <th className="p-3 text-center font-medium text-gray-600">
                  Использовано
                </th>
                <th className="p-3 text-left font-medium text-gray-600">Период</th>
                <th className="p-3 text-left font-medium text-gray-600">Площадка</th>
                <th className="p-3 text-center font-medium text-gray-600">Статус</th>
                <th className="p-3 text-right font-medium text-gray-600">
                  Общая скидка
                </th>
                <th className="p-3 text-center font-medium text-gray-600">
                  Действие
                </th>
              </tr>
            </thead>
            <tbody>
              {promocodes?.map((promo) => (
                <tr
                  key={promo.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="p-3 font-mono font-bold text-gray-900">
                    {promo.code}
                  </td>
                  <td className="p-3 text-gray-600">
                    {TYPE_LABELS[promo.type] || promo.type}
                  </td>
                  <td className="p-3 text-right font-medium text-gray-900">
                    {promo.type === "PERCENTAGE"
                      ? `${promo.value}%`
                      : `${promo.value.toLocaleString("ru-RU")} ₽`}
                  </td>
                  <td className="p-3 text-center text-gray-600">
                    {promo.usedCount}
                    {promo.maxUses ? ` / ${promo.maxUses}` : " / --"}
                  </td>
                  <td className="p-3 text-gray-600 text-xs">
                    {promo.validFrom && promo.validTo ? (
                      <>
                        {new Date(promo.validFrom).toLocaleDateString("ru-RU")}
                        {" - "}
                        {new Date(promo.validTo).toLocaleDateString("ru-RU")}
                      </>
                    ) : (
                      "Бессрочно"
                    )}
                  </td>
                  <td className="p-3 text-gray-600">
                    {promo.venueName || "Все"}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        promo.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {promo.isActive ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td className="p-3 text-right font-medium text-gray-900">
                    {promo.totalDiscountGiven.toLocaleString("ru-RU")} ₽
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleActive(promo.id, promo.isActive)}
                      className={`px-3 py-1 text-xs font-medium rounded-lg ${
                        promo.isActive
                          ? "text-red-700 bg-red-50 hover:bg-red-100"
                          : "text-green-700 bg-green-50 hover:bg-green-100"
                      }`}
                    >
                      {promo.isActive ? "Деактивировать" : "Активировать"}
                    </button>
                  </td>
                </tr>
              ))}
              {promocodes?.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-gray-500">
                    Промокоды не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setCreating(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900">
              Новый промокод
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Код
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                  placeholder="SUMMER2025"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тип
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as "PERCENTAGE" | "FIXED" | "BONUS",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PERCENTAGE">Процент</option>
                    <option value="FIXED">Фиксированная</option>
                    <option value="BONUS">Бонусы</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Значение
                  </label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) =>
                      setForm({ ...form, value: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Макс. использований (пусто = без ограничений)
                </label>
                <input
                  type="number"
                  value={form.maxUses}
                  onChange={(e) =>
                    setForm({ ...form, maxUses: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Действует с
                  </label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) =>
                      setForm({ ...form, validFrom: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Действует до
                  </label>
                  <input
                    type="date"
                    value={form.validTo}
                    onChange={(e) =>
                      setForm({ ...form, validTo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Площадка (пусто = все)
                </label>
                <select
                  value={form.venueId}
                  onChange={(e) =>
                    setForm({ ...form, venueId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Все площадки</option>
                  {venues?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={createPromocode}
                disabled={saving || !form.code}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Создание..." : "Создать"}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
