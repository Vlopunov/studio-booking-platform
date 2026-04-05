"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface Schedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface PricingRule {
  id: string;
  name: string;
  type: string;
  value: number;
  conditions: string;
}

interface Addon {
  id: string;
  name: string;
  price: number;
  description: string;
}

interface Venue {
  id: string;
  name: string;
  type: string;
  description: string;
  pricePerHour: number;
  photoUrl: string;
  address: string;
  schedules: Schedule[];
  pricingRules: PricingRule[];
  addons: Addon[];
}

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const TYPE_BADGES: Record<string, string> = {
  PHOTO_STUDIO: "bg-pink-100 text-pink-700",
  COWORKING: "bg-blue-100 text-blue-700",
  EVENT_SPACE: "bg-orange-100 text-orange-700",
  MEETING_ROOM: "bg-green-100 text-green-700",
};

export default function VenuesPage() {
  const { data: venues, loading, refetch } = useApi<Venue[]>("/api/venues");
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    type: "",
    description: "",
    pricePerHour: 0,
    photoUrl: "",
    address: "",
  });

  const openEdit = (venue: Venue) => {
    setEditingVenue(venue);
    setForm({
      name: venue.name,
      type: venue.type,
      description: venue.description,
      pricePerHour: venue.pricePerHour,
      photoUrl: venue.photoUrl,
      address: venue.address,
    });
  };

  const openCreate = () => {
    setEditingVenue({} as Venue);
    setForm({
      name: "",
      type: "PHOTO_STUDIO",
      description: "",
      pricePerHour: 0,
      photoUrl: "",
      address: "",
    });
  };

  const saveVenue = async () => {
    setSaving(true);
    try {
      if (editingVenue?.id) {
        await api.patch(`/api/venues/${editingVenue.id}`, form);
      } else {
        await api.post("/api/venues", form);
      }
      setEditingVenue(null);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Площадки</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Создать площадку
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {venues?.map((venue) => (
            <div
              key={venue.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              {/* Photo */}
              <div className="h-40 bg-gray-100 relative">
                {venue.photoUrl ? (
                  <img
                    src={venue.photoUrl}
                    alt={venue.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">
                    &#128247;
                  </div>
                )}
                <span
                  className={`absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGES[venue.type] || "bg-gray-100 text-gray-700"}`}
                >
                  {venue.type}
                </span>
              </div>

              {/* Info */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {venue.name}
                  </h3>
                  <span className="text-lg font-bold text-blue-600">
                    {venue.pricePerHour.toLocaleString("ru-RU")} ₽/ч
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {venue.description}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(venue)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() =>
                      setExpandedVenue(
                        expandedVenue === venue.id ? null : venue.id
                      )
                    }
                    className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    {expandedVenue === venue.id ? "Свернуть" : "Детали"}
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {expandedVenue === venue.id && (
                <div className="border-t border-gray-200 p-4 space-y-4">
                  {/* Schedule */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Расписание
                    </h4>
                    <div className="space-y-1">
                      {venue.schedules?.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-600">
                            {DAY_NAMES[s.dayOfWeek]}
                          </span>
                          <span
                            className={
                              s.isActive
                                ? "font-medium text-gray-900"
                                : "text-gray-400"
                            }
                          >
                            {s.isActive
                              ? `${s.startTime} - ${s.endTime}`
                              : "Выходной"}
                          </span>
                        </div>
                      ))}
                      {(!venue.schedules || venue.schedules.length === 0) && (
                        <p className="text-sm text-gray-400">Не настроено</p>
                      )}
                    </div>
                  </div>

                  {/* Pricing rules */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Правила ценообразования
                    </h4>
                    <div className="space-y-1">
                      {venue.pricingRules?.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2"
                        >
                          <span className="text-gray-700">{rule.name}</span>
                          <span className="font-medium text-gray-900">
                            {rule.type === "PERCENTAGE"
                              ? `${rule.value}%`
                              : `${rule.value.toLocaleString("ru-RU")} ₽`}
                          </span>
                        </div>
                      ))}
                      {(!venue.pricingRules || venue.pricingRules.length === 0) && (
                        <p className="text-sm text-gray-400">Нет правил</p>
                      )}
                    </div>
                  </div>

                  {/* Addons */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Дополнительные услуги
                    </h4>
                    <div className="space-y-1">
                      {venue.addons?.map((addon) => (
                        <div
                          key={addon.id}
                          className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2"
                        >
                          <div>
                            <span className="text-gray-700">{addon.name}</span>
                            {addon.description && (
                              <p className="text-xs text-gray-400">
                                {addon.description}
                              </p>
                            )}
                          </div>
                          <span className="font-medium text-gray-900">
                            {addon.price.toLocaleString("ru-RU")} ₽
                          </span>
                        </div>
                      ))}
                      {(!venue.addons || venue.addons.length === 0) && (
                        <p className="text-sm text-gray-400">Нет услуг</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {editingVenue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setEditingVenue(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900">
              {editingVenue.id ? "Редактировать площадку" : "Новая площадка"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Тип
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PHOTO_STUDIO">Фотостудия</option>
                  <option value="COWORKING">Коворкинг</option>
                  <option value="EVENT_SPACE">Ивент-пространство</option>
                  <option value="MEETING_ROOM">Переговорная</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Цена за час (₽)
                  </label>
                  <input
                    type="number"
                    value={form.pricePerHour}
                    onChange={(e) =>
                      setForm({ ...form, pricePerHour: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL фото
                  </label>
                  <input
                    type="text"
                    value={form.photoUrl}
                    onChange={(e) =>
                      setForm({ ...form, photoUrl: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Адрес
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={saveVenue}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                onClick={() => setEditingVenue(null)}
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
