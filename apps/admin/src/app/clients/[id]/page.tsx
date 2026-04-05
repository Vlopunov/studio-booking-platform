"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  telegram: string;
  birthday: string;
  tags: string[];
  adminNotes: string;
  tier: string;
  bonusBalance: number;
  totalBookings: number;
  totalSpent: number;
  avgCheck: number;
  favoriteVenue: string;
  preferredTime: string;
  bookings: ClientBooking[];
  reviews: ClientReview[];
  referredBy: { id: string; name: string } | null;
  referrals: { id: string; name: string }[];
}

interface ClientBooking {
  id: string;
  humanId: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  totalPrice: number;
}

interface ClientReview {
  id: string;
  venueName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

const TIER_BADGES: Record<string, string> = {
  STANDARD: "bg-gray-100 text-gray-700",
  SILVER: "bg-slate-200 text-slate-700",
  GOLD: "bg-yellow-100 text-yellow-700",
  PLATINUM: "bg-indigo-100 text-indigo-700",
};

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Ожидает" },
  CONFIRMED: { bg: "bg-green-100", text: "text-green-800", label: "Подтверждено" },
  COMPLETED: { bg: "bg-gray-100", text: "text-gray-800", label: "Завершено" },
  CANCELLED: { bg: "bg-red-100", text: "text-red-800", label: "Отменено" },
  NO_SHOW: { bg: "bg-purple-100", text: "text-purple-800", label: "Неявка" },
};

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const { data: client, loading, refetch } = useApi<ClientProfile>(
    `/admin/clients/${clientId}`
  );

  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (client && !tagsLoaded) {
    setTags(client.tags || []);
    setTagsLoaded(true);
  }
  if (client && !notesLoaded) {
    setAdminNotes(client.adminNotes || "");
    setNotesLoaded(true);
  }

  const addTag = () => {
    if (!newTag.trim()) return;
    const updated = [...tags, newTag.trim()];
    setTags(updated);
    setNewTag("");
    api.patch(`/admin/clients/${clientId}`, { tags: updated });
  };

  const removeTag = (tag: string) => {
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    api.patch(`/admin/clients/${clientId}`, { tags: updated });
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/clients/${clientId}`, { adminNotes });
    } finally {
      setSaving(false);
    }
  };

  const adjustBonus = async (type: "add" | "subtract") => {
    const amount = Number(bonusAmount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      await api.post(`/admin/clients/${clientId}/bonus`, {
        amount: type === "add" ? amount : -amount,
        reason: bonusReason,
      });
      setBonusAmount("");
      setBonusReason("");
      refetch();
    } finally {
      setSaving(false);
    }
  };

  if (loading || !client) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/clients")}
          className="text-gray-400 hover:text-gray-600"
        >
          &larr; Назад
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        <span
          className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${TIER_BADGES[client.tier] || TIER_BADGES.STANDARD}`}
        >
          {client.tier}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Контактная информация
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Телефон</span>
                <p className="font-medium text-gray-900">{client.phone || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">Email</span>
                <p className="font-medium text-gray-900">{client.email || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">Telegram</span>
                <p className="font-medium text-gray-900">{client.telegram || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500">День рождения</span>
                <p className="font-medium text-gray-900">
                  {client.birthday
                    ? new Date(client.birthday).toLocaleDateString("ru-RU")
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Теги</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-1 text-blue-400 hover:text-blue-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="Новый тег..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addTag}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Добавить
              </button>
            </div>
          </div>

          {/* Admin notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Заметки администратора
            </h2>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Заметки о клиенте..."
            />
            <button
              onClick={saveNotes}
              disabled={saving}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>

          {/* Booking timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              История бронирований
            </h2>
            <div className="space-y-3">
              {client.bookings?.map((booking) => {
                const badge = STATUS_BADGES[booking.status] || {
                  bg: "bg-gray-100",
                  text: "text-gray-700",
                  label: booking.status,
                };
                return (
                  <div
                    key={booking.id}
                    onClick={() => router.push(`/bookings/${booking.id}`)}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-500">
                        #{booking.humanId}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {booking.venueName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {booking.date} {booking.startTime}-{booking.endTime}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {booking.totalPrice.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                  </div>
                );
              })}
              {(!client.bookings || client.bookings.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Нет бронирований
                </p>
              )}
            </div>
          </div>

          {/* Reviews */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Отзывы</h2>
            <div className="space-y-3">
              {client.reviews?.map((review) => (
                <div key={review.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${star <= review.rating ? "text-yellow-400" : "text-gray-300"}`}
                          >
                            &#9733;
                          </span>
                        ))}
                      </div>
                      <span className="text-sm text-gray-600">
                        {review.venueName}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{review.comment}</p>
                </div>
              ))}
              {(!client.reviews || client.reviews.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Нет отзывов
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Loyalty card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Программа лояльности
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Уровень</span>
                <span
                  className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${TIER_BADGES[client.tier] || TIER_BADGES.STANDARD}`}
                >
                  {client.tier}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Бонусный баланс</span>
                <span className="text-lg font-bold text-green-600">
                  {client.bonusBalance.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
              <input
                type="number"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
                placeholder="Сумма"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={bonusReason}
                onChange={(e) => setBonusReason(e.target.value)}
                placeholder="Причина"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => adjustBonus("add")}
                  disabled={saving}
                  className="flex-1 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
                >
                  + Начислить
                </button>
                <button
                  onClick={() => adjustBonus("subtract")}
                  disabled={saving}
                  className="flex-1 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                >
                  - Списать
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Статистика
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Всего бронирований</span>
                <span className="font-medium text-gray-900">
                  {client.totalBookings}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Общая сумма</span>
                <span className="font-medium text-gray-900">
                  {client.totalSpent.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Средний чек</span>
                <span className="font-medium text-gray-900">
                  {client.avgCheck.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Любимая площадка</span>
                <span className="font-medium text-gray-900">
                  {client.favoriteVenue || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Предпочитаемое время</span>
                <span className="font-medium text-gray-900">
                  {client.preferredTime || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Referrals */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Рефералы
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Привел</span>
                {client.referredBy ? (
                  <a
                    href={`/clients/${client.referredBy.id}`}
                    className="block font-medium text-blue-600 hover:text-blue-700"
                  >
                    {client.referredBy.name}
                  </a>
                ) : (
                  <p className="text-gray-400">—</p>
                )}
              </div>
              <div>
                <span className="text-gray-500">
                  Приглашенные ({client.referrals?.length || 0})
                </span>
                <div className="mt-1 space-y-1">
                  {client.referrals?.map((ref) => (
                    <a
                      key={ref.id}
                      href={`/clients/${ref.id}`}
                      className="block text-blue-600 hover:text-blue-700"
                    >
                      {ref.name}
                    </a>
                  ))}
                  {(!client.referrals || client.referrals.length === 0) && (
                    <p className="text-gray-400">Нет приглашенных</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
