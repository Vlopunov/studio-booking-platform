"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface PriceBreakdown {
  base: number;
  pricingRules: { name: string; amount: number }[];
  addons: { name: string; amount: number }[];
  discount: number;
  total: number;
}

interface ClientCard {
  id: string;
  name: string;
  phone: string;
  tier: string;
  totalBookings: number;
}

interface StatusChange {
  status: string;
  changedAt: string;
  changedBy: string;
  note?: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface BookingDetail {
  id: string;
  humanId: string;
  venueName: string;
  venueId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  priceBreakdown: PriceBreakdown;
  client: ClientCard;
  adminNote: string;
  review?: Review;
  timeline: StatusChange[];
}

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Ожидает" },
  CONFIRMED: { bg: "bg-green-100", text: "text-green-800", label: "Подтверждено" },
  COMPLETED: { bg: "bg-gray-100", text: "text-gray-800", label: "Завершено" },
  CANCELLED: { bg: "bg-red-100", text: "text-red-800", label: "Отменено" },
  NO_SHOW: { bg: "bg-purple-100", text: "text-purple-800", label: "Неявка" },
};

const TIER_BADGES: Record<string, string> = {
  STANDARD: "bg-gray-100 text-gray-700",
  SILVER: "bg-slate-100 text-slate-700",
  GOLD: "bg-yellow-100 text-yellow-700",
  PLATINUM: "bg-indigo-100 text-indigo-700",
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const { data: booking, loading, refetch } = useApi<BookingDetail>(
    `/admin/bookings/${bookingId}`
  );

  const [adminNote, setAdminNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (booking && !noteLoaded) {
    setAdminNote(booking.adminNote || "");
    setNoteLoaded(true);
  }

  const handleStatusChange = async (status: string) => {
    setSaving(true);
    try {
      await api.patch(`/admin/bookings/${bookingId}/status`, { status });
      setConfirmAction(null);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/bookings/${bookingId}`, { adminNote });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !booking) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGES[booking.status];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/bookings")}
            className="text-gray-400 hover:text-gray-600"
          >
            &larr; Назад
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Бронь #{booking.humanId}
          </h1>
          <span
            className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Booking info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Информация о бронировании
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Площадка</span>
                <p className="font-medium text-gray-900">{booking.venueName}</p>
              </div>
              <div>
                <span className="text-gray-500">Дата</span>
                <p className="font-medium text-gray-900">{booking.date}</p>
              </div>
              <div>
                <span className="text-gray-500">Время</span>
                <p className="font-medium text-gray-900">
                  {booking.startTime} - {booking.endTime}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Статус</span>
                <p>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Расчет стоимости
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Базовая стоимость</span>
                <span className="font-medium">
                  {booking.priceBreakdown.base.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              {booking.priceBreakdown.pricingRules.map((rule, i) => (
                <div key={i} className="flex justify-between text-blue-600">
                  <span>{rule.name}</span>
                  <span>
                    {rule.amount > 0 ? "+" : ""}
                    {rule.amount.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              ))}
              {booking.priceBreakdown.addons.map((addon, i) => (
                <div key={i} className="flex justify-between text-green-600">
                  <span>{addon.name}</span>
                  <span>+{addon.amount.toLocaleString("ru-RU")} ₽</span>
                </div>
              ))}
              {booking.priceBreakdown.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Скидка</span>
                  <span>
                    -{booking.priceBreakdown.discount.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t border-gray-200 text-base font-bold">
                <span>Итого</span>
                <span>
                  {booking.priceBreakdown.total.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            </div>
          </div>

          {/* Admin actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Действия администратора
            </h2>
            <div className="flex flex-wrap gap-3">
              {booking.status === "PENDING" && (
                <button
                  onClick={() => setConfirmAction("CONFIRMED")}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                >
                  Подтвердить
                </button>
              )}
              {(booking.status === "PENDING" || booking.status === "CONFIRMED") && (
                <button
                  onClick={() => setConfirmAction("CANCELLED")}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Отменить
                </button>
              )}
              {booking.status === "CONFIRMED" && (
                <>
                  <button
                    onClick={() => setConfirmAction("COMPLETED")}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700"
                  >
                    Завершить
                  </button>
                  <button
                    onClick={() => setConfirmAction("NO_SHOW")}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                  >
                    Неявка
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Admin note */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Заметка администратора
            </h2>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Добавить заметку..."
            />
            <button
              onClick={saveNote}
              disabled={saving}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Сохранить заметку"}
            </button>
          </div>

          {/* Review */}
          {booking.review && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Отзыв</h2>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`text-lg ${star <= booking.review!.rating ? "text-yellow-400" : "text-gray-300"}`}
                    >
                      &#9733;
                    </span>
                  ))}
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(booking.review.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </div>
              <p className="text-sm text-gray-700">{booking.review.comment}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              История изменений
            </h2>
            <div className="space-y-4">
              {booking.timeline.map((item, i) => {
                const itemBadge = STATUS_BADGES[item.status] || {
                  bg: "bg-gray-100",
                  text: "text-gray-700",
                  label: item.status,
                };
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${itemBadge.bg} ${itemBadge.text}`}
                        >
                          {itemBadge.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(item.changedAt).toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {item.changedBy}
                        {item.note && ` — ${item.note}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar - Client card */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Клиент</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Имя</span>
                <p className="font-medium text-gray-900">{booking.client.name}</p>
              </div>
              <div>
                <span className="text-gray-500">Телефон</span>
                <p className="font-medium text-gray-900">{booking.client.phone}</p>
              </div>
              <div>
                <span className="text-gray-500">Уровень</span>
                <p>
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${TIER_BADGES[booking.client.tier] || TIER_BADGES.STANDARD}`}
                  >
                    {booking.client.tier}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-gray-500">Всего бронирований</span>
                <p className="font-medium text-gray-900">
                  {booking.client.totalBookings}
                </p>
              </div>
            </div>
            <a
              href={`/clients/${booking.client.id}`}
              className="mt-4 block text-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
            >
              Профиль клиента
            </a>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900">
              Подтвердите действие
            </h3>
            <p className="text-sm text-gray-600">
              Вы уверены, что хотите изменить статус на{" "}
              <span className="font-medium">
                {STATUS_BADGES[confirmAction]?.label || confirmAction}
              </span>
              ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleStatusChange(confirmAction)}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "..." : "Да, изменить"}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
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
