"use client";

import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";

const triggerLabels: Record<string, string> = {
  BOOKING_ABANDONED: "Брошенная бронь",
  FIRST_BOOKING_COMPLETED: "Первая бронь",
  NO_BOOKING_7_DAYS: "Нет бронь 7 дней",
  INACTIVE_30_DAYS: "Неактивен 30 дней",
  INACTIVE_60_DAYS: "Неактивен 60 дней",
  INACTIVE_90_DAYS: "Неактивен 90 дней",
  BIRTHDAY_3_DAYS_BEFORE: "День рождения",
  TIER_UPGRADE: "Повышение уровня",
  BONUS_EXPIRY_7_DAYS: "Бонусы сгорают",
  REVIEW_POSITIVE: "Положительный отзыв",
  BOOKING_MILESTONE: "Юбилейная бронь",
};

export default function AutoMessagesPage() {
  const { data: messages, loading, refetch } = useApi<any[]>("/api/auto-messages");

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/api/auto-messages/${id}`, { isActive: !isActive });
    refetch();
  };

  if (loading) return <div className="p-8 text-gray-500">Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Автосообщения</h1>
      </div>

      <div className="space-y-4">
        {messages?.map((msg) => (
          <div
            key={msg.id}
            className="bg-white rounded-xl shadow-sm border p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{msg.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {triggerLabels[msg.trigger] || msg.trigger}
                  </span>
                  {msg.delayMinutes > 0 && (
                    <span className="text-xs text-gray-400">
                      Задержка: {msg.delayMinutes} мин.
                    </span>
                  )}
                </div>

                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                  {msg.messageText}
                </div>

                <div className="mt-3 flex items-center gap-6 text-sm text-gray-500">
                  <span>
                    Макс. отправок: {msg.maxSendsPerClient}
                  </span>
                  <span>
                    Cooldown: {msg.cooldownDays} дн.
                  </span>
                  {msg.tierRestriction && (
                    <span>Для: {msg.tierRestriction}+</span>
                  )}
                </div>

                {/* 30-day stats */}
                {msg.stats30d && (
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="text-gray-500">За 30 дней:</span>
                    <span>Отправлено: <strong>{msg.stats30d.sent}</strong></span>
                    <span>
                      Клики: <strong>{msg.stats30d.clicked}</strong>{" "}
                      ({msg.stats30d.clickRate.toFixed(1)}%)
                    </span>
                    <span>
                      Конверсии: <strong>{msg.stats30d.converted}</strong>{" "}
                      ({msg.stats30d.conversionRate.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => toggleActive(msg.id, msg.isActive)}
                className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  msg.isActive ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    msg.isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
