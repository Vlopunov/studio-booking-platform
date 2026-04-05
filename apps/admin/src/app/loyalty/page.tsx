"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface LoyaltySettings {
  tiers: {
    silver: { minBookings: number; minSpent: number; discountPercent: number };
    gold: { minBookings: number; minSpent: number; discountPercent: number };
    platinum: { minBookings: number; minSpent: number; discountPercent: number };
  };
  bonusRates: {
    earnPercent: number;
    redeemPercent: number;
    maxRedeemPercent: number;
  };
  referral: {
    referrerBonus: number;
    refereeBonus: number;
    enabled: boolean;
  };
  birthday: {
    bonusAmount: number;
    discountPercent: number;
    validDays: number;
    enabled: boolean;
  };
  winBack: {
    inactiveDays: number;
    bonusAmount: number;
    enabled: boolean;
  };
  expiry: {
    bonusExpiryDays: number;
    notifyBeforeDays: number;
  };
}

const defaultSettings: LoyaltySettings = {
  tiers: {
    silver: { minBookings: 3, minSpent: 15000, discountPercent: 5 },
    gold: { minBookings: 10, minSpent: 50000, discountPercent: 10 },
    platinum: { minBookings: 25, minSpent: 150000, discountPercent: 15 },
  },
  bonusRates: { earnPercent: 5, redeemPercent: 100, maxRedeemPercent: 30 },
  referral: { referrerBonus: 500, refereeBonus: 500, enabled: true },
  birthday: {
    bonusAmount: 1000,
    discountPercent: 15,
    validDays: 7,
    enabled: true,
  },
  winBack: { inactiveDays: 60, bonusAmount: 500, enabled: true },
  expiry: { bonusExpiryDays: 365, notifyBeforeDays: 30 },
};

function computeTier(
  bookings: number,
  spent: number,
  settings: LoyaltySettings
): { tier: string; discount: number } {
  const { tiers } = settings;
  if (
    bookings >= tiers.platinum.minBookings &&
    spent >= tiers.platinum.minSpent
  )
    return { tier: "Platinum", discount: tiers.platinum.discountPercent };
  if (bookings >= tiers.gold.minBookings && spent >= tiers.gold.minSpent)
    return { tier: "Gold", discount: tiers.gold.discountPercent };
  if (bookings >= tiers.silver.minBookings && spent >= tiers.silver.minSpent)
    return { tier: "Silver", discount: tiers.silver.discountPercent };
  return { tier: "Standard", discount: 0 };
}

export default function LoyaltyPage() {
  const { data, loading } = useApi<LoyaltySettings>("/api/loyalty/settings");
  const [settings, setSettings] = useState<LoyaltySettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !loaded) {
      setSettings(data);
      setLoaded(true);
    }
  }, [data, loaded]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/api/loyalty/settings", settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const updateNested = (path: string, value: number | boolean) => {
    setSettings((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = copy;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return copy;
    });
  };

  const preview = computeTier(10, 80000, settings);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-96 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Настройки программы лояльности
        </h1>
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Сохранение..." : saved ? "Сохранено!" : "Сохранить"}
        </button>
      </div>

      {/* Preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <span className="font-medium">Предпросмотр: </span>
          Если клиент имеет 10 бронирований и потратил 80 000 ₽, его уровень:{" "}
          <span className="font-bold">
            {preview.tier} ({preview.discount}% скидка)
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier thresholds */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Пороги уровней
          </h2>
          {(["silver", "gold", "platinum"] as const).map((tier) => (
            <div key={tier} className="mb-4 pb-4 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 capitalize">
                {tier === "silver" ? "Silver" : tier === "gold" ? "Gold" : "Platinum"}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Мин. бронирований
                  </label>
                  <input
                    type="number"
                    value={settings.tiers[tier].minBookings}
                    onChange={(e) =>
                      updateNested(
                        `tiers.${tier}.minBookings`,
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Мин. сумма (₽)
                  </label>
                  <input
                    type="number"
                    value={settings.tiers[tier].minSpent}
                    onChange={(e) =>
                      updateNested(
                        `tiers.${tier}.minSpent`,
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Скидка (%)
                  </label>
                  <input
                    type="number"
                    value={settings.tiers[tier].discountPercent}
                    onChange={(e) =>
                      updateNested(
                        `tiers.${tier}.discountPercent`,
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bonus rates */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Бонусные ставки
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Начисление бонусов (% от чека)
              </label>
              <input
                type="number"
                value={settings.bonusRates.earnPercent}
                onChange={(e) =>
                  updateNested("bonusRates.earnPercent", Number(e.target.value))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Курс списания (%)
              </label>
              <input
                type="number"
                value={settings.bonusRates.redeemPercent}
                onChange={(e) =>
                  updateNested(
                    "bonusRates.redeemPercent",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Макс. оплата бонусами (% от чека)
              </label>
              <input
                type="number"
                value={settings.bonusRates.maxRedeemPercent}
                onChange={(e) =>
                  updateNested(
                    "bonusRates.maxRedeemPercent",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Referral program */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Реферальная программа
            </h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.referral.enabled}
                onChange={(e) =>
                  updateNested("referral.enabled", e.target.checked)
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Активна</span>
            </label>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Бонус пригласившему (₽)
              </label>
              <input
                type="number"
                value={settings.referral.referrerBonus}
                onChange={(e) =>
                  updateNested(
                    "referral.referrerBonus",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Бонус приглашенному (₽)
              </label>
              <input
                type="number"
                value={settings.referral.refereeBonus}
                onChange={(e) =>
                  updateNested(
                    "referral.refereeBonus",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Birthday bonus */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Бонус на день рождения
            </h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.birthday.enabled}
                onChange={(e) =>
                  updateNested("birthday.enabled", e.target.checked)
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Активен</span>
            </label>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Сумма бонуса (₽)
              </label>
              <input
                type="number"
                value={settings.birthday.bonusAmount}
                onChange={(e) =>
                  updateNested(
                    "birthday.bonusAmount",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Скидка (%)
              </label>
              <input
                type="number"
                value={settings.birthday.discountPercent}
                onChange={(e) =>
                  updateNested(
                    "birthday.discountPercent",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Срок действия (дней)
              </label>
              <input
                type="number"
                value={settings.birthday.validDays}
                onChange={(e) =>
                  updateNested(
                    "birthday.validDays",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Win-back */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Возврат клиентов (Win-back)
            </h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.winBack.enabled}
                onChange={(e) =>
                  updateNested("winBack.enabled", e.target.checked)
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Активен</span>
            </label>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Дней неактивности
              </label>
              <input
                type="number"
                value={settings.winBack.inactiveDays}
                onChange={(e) =>
                  updateNested(
                    "winBack.inactiveDays",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Сумма бонуса (₽)
              </label>
              <input
                type="number"
                value={settings.winBack.bonusAmount}
                onChange={(e) =>
                  updateNested(
                    "winBack.bonusAmount",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Expiry */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Срок действия бонусов
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Срок сгорания (дней)
              </label>
              <input
                type="number"
                value={settings.expiry.bonusExpiryDays}
                onChange={(e) =>
                  updateNested(
                    "expiry.bonusExpiryDays",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Уведомление за (дней)
              </label>
              <input
                type="number"
                value={settings.expiry.notifyBeforeDays}
                onChange={(e) =>
                  updateNested(
                    "expiry.notifyBeforeDays",
                    Number(e.target.value)
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
