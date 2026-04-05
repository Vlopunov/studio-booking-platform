"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clsx } from "clsx";

const TRIGGERS = ["BROADCAST", "AUTOMATED", "SCHEDULED"] as const;

const TEMPLATE_VARS = [
  "{firstName}",
  "{loyaltyTier}",
  "{bonusBalance}",
  "{totalBookings}",
  "{referralCode}",
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "BROADCAST" as (typeof TRIGGERS)[number],
    messageText: "",
    messagePhoto: "",
    buttonText: "",
    buttonAction: "",
    targeting: {
      tiers: [] as string[],
      tags: [] as string[],
      excludeTags: ["no-marketing"],
      lastBookingDaysAgo: { min: undefined as number | undefined, max: undefined as number | undefined },
      totalBookings: { min: undefined as number | undefined, max: undefined as number | undefined },
      venues: [] as string[],
    },
    scheduledAt: "",
  });

  const handleSave = async (sendNow = false) => {
    setSaving(true);
    try {
      const campaign = await api.post<any>("/api/campaigns", {
        ...form,
        messagePhoto: form.messagePhoto || undefined,
        scheduledAt: form.scheduledAt || undefined,
      });

      if (sendNow) {
        await api.post(`/api/campaigns/${campaign.id}/send`, {});
      }

      router.push(`/campaigns/${campaign.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const previewAudience = async () => {
    try {
      const result = await api.post<any>("/api/campaigns/preview-audience", {
        targeting: form.targeting,
      });
      setAudiencePreview(result.audienceSize);
    } catch {
      setAudiencePreview(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Новая кампания</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-4 mb-8">
        {["Контент", "Таргетинг", "Отправка"].map((label, idx) => (
          <button
            key={label}
            onClick={() => setStep(idx + 1)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              step === idx + 1
                ? "bg-blue-600 text-white"
                : step > idx + 1
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
            )}
          >
            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
              {idx + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* Step 1: Content */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название кампании
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Акция 8 марта"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="BROADCAST">Рассылка (одноразовая)</option>
              <option value="SCHEDULED">Запланированная</option>
              <option value="AUTOMATED">Автоматическая (триггерная)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Текст сообщения
            </label>
            <textarea
              value={form.messageText}
              onChange={(e) => setForm({ ...form, messageText: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg min-h-[150px] font-mono text-sm"
              placeholder="Привет, {firstName}! ..."
            />
            <div className="flex gap-2 mt-2">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v}
                  onClick={() =>
                    setForm({ ...form, messageText: form.messageText + v })
                  }
                  className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL фото (опционально)
            </label>
            <input
              type="text"
              value={form.messagePhoto}
              onChange={(e) => setForm({ ...form, messagePhoto: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Текст кнопки CTA
              </label>
              <input
                type="text"
                value={form.buttonText}
                onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="📸 Забронировать"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Действие кнопки
              </label>
              <select
                value={form.buttonAction}
                onChange={(e) => setForm({ ...form, buttonAction: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">— Без кнопки —</option>
                <option value="book">Забронировать</option>
                <option value="referral">Пригласить друга</option>
                <option value="loyalty">Моя лояльность</option>
              </select>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6 p-4 bg-gray-900 rounded-xl text-white">
            <div className="text-xs text-gray-400 mb-2">Предпросмотр (Telegram)</div>
            <div className="whitespace-pre-wrap text-sm">{form.messageText || "Текст сообщения..."}</div>
            {form.buttonText && (
              <div className="mt-3">
                <span className="inline-block px-4 py-2 bg-blue-500 rounded-lg text-sm">
                  {form.buttonText}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!form.name || !form.messageText}
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Далее: Таргетинг
          </button>
        </div>
      )}

      {/* Step 2: Targeting */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Таргетинг аудитории</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Уровень лояльности
            </label>
            <div className="flex gap-3">
              {["STANDARD", "SILVER", "GOLD", "PLATINUM"].map((tier) => (
                <label key={tier} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.targeting.tiers.includes(tier)}
                    onChange={(e) => {
                      const tiers = e.target.checked
                        ? [...form.targeting.tiers, tier]
                        : form.targeting.tiers.filter((t) => t !== tier);
                      setForm({
                        ...form,
                        targeting: { ...form.targeting, tiers },
                      });
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{tier}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Последняя бронь (от ... дней назад)
              </label>
              <input
                type="number"
                value={form.targeting.lastBookingDaysAgo.min || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targeting: {
                      ...form.targeting,
                      lastBookingDaysAgo: {
                        ...form.targeting.lastBookingDaysAgo,
                        min: e.target.value ? parseInt(e.target.value) : undefined,
                      },
                    },
                  })
                }
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Мин."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Последняя бронь (до ... дней назад)
              </label>
              <input
                type="number"
                value={form.targeting.lastBookingDaysAgo.max || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targeting: {
                      ...form.targeting,
                      lastBookingDaysAgo: {
                        ...form.targeting.lastBookingDaysAgo,
                        max: e.target.value ? parseInt(e.target.value) : undefined,
                      },
                    },
                  })
                }
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Макс."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Бронирований (от)
              </label>
              <input
                type="number"
                value={form.targeting.totalBookings.min || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targeting: {
                      ...form.targeting,
                      totalBookings: {
                        ...form.targeting.totalBookings,
                        min: e.target.value ? parseInt(e.target.value) : undefined,
                      },
                    },
                  })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Бронирований (до)
              </label>
              <input
                type="number"
                value={form.targeting.totalBookings.max || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targeting: {
                      ...form.targeting,
                      totalBookings: {
                        ...form.targeting.totalBookings,
                        max: e.target.value ? parseInt(e.target.value) : undefined,
                      },
                    },
                  })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          {audiencePreview !== null && (
            <div className="p-3 bg-blue-50 rounded-lg text-blue-700 font-medium">
              Подходит {audiencePreview} клиентов
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Назад
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Далее: Отправка
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Send */}
      {step === 3 && (
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Отправка</h2>

          {form.type === "SCHEDULED" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата и время отправки
              </label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Назад
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex-1 py-2 border-2 border-blue-600 text-blue-600 rounded-lg font-medium hover:bg-blue-50"
            >
              Сохранить черновик
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              {form.type === "SCHEDULED" ? "Запланировать" : "Отправить сейчас"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
