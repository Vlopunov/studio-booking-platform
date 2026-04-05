"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { StatCard } from "@/components/stat-card";
import { clsx } from "clsx";
import type { RfmStats } from "@studio/types";

/* ─── Types ─── */

interface DashboardStats {
  todayBookings: number;
  revenue: number;
  utilization: number;
  pendingCount: number;
}

interface Booking {
  id: string;
  clientName: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: string;
}

interface BookingsResponse {
  data: Booking[];
}

interface ReferralStats {
  viralCoefficient: number;
  topReferrers: Array<{
    id: string;
    name: string;
    code: string;
    referrals: number;
  }>;
}

/* ─── Helpers ─── */

function formatCurrency(value: number): string {
  return value.toLocaleString("ru-RU") + " \u20BD";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  PENDING: { label: "Ожидает", classes: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Подтверждено", classes: "bg-green-100 text-green-800" },
  COMPLETED: { label: "Завершено", classes: "bg-gray-100 text-gray-700" },
  CANCELLED: { label: "Отменено", classes: "bg-red-100 text-red-800" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    classes: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.classes
      )}
    >
      {config.label}
    </span>
  );
}

function getSegmentEmoji(segment: string): string {
  const map: Record<string, string> = {
    CHAMPIONS: "\uD83C\uDFC6",
    LOYAL: "\u2764\uFE0F",
    PROMISING: "\uD83C\uDF31",
    NEW: "\u2728",
    SLEEPING: "\uD83D\uDE34",
    LOST: "\uD83D\uDC4B",
  };
  return map[segment] || "\uD83D\uDCCA";
}

function getSegmentName(segment: string): string {
  const map: Record<string, string> = {
    CHAMPIONS: "\u0427\u0435\u043C\u043F\u0438\u043E\u043D\u044B",
    LOYAL: "\u041B\u043E\u044F\u043B\u044C\u043D\u044B\u0435",
    PROMISING: "\u041F\u0435\u0440\u0441\u043F\u0435\u043A\u0442\u0438\u0432\u043D\u044B\u0435",
    NEW: "\u041D\u043E\u0432\u0438\u0447\u043A\u0438",
    SLEEPING: "\u0421\u043F\u044F\u0449\u0438\u0435",
    LOST: "\u041F\u043E\u0442\u0435\u0440\u044F\u043D\u043D\u044B\u0435",
  };
  return map[segment] || segment;
}

/* ─── Main page ─── */

export default function DashboardPage() {
  const { data: stats, loading: statsLoading } =
    useApi<DashboardStats>("/api/dashboard/stats");

  const {
    data: pendingBookings,
    loading: pendingLoading,
    refetch: refetchPending,
  } = useApi<BookingsResponse>("/api/bookings?status=PENDING&page=1&pageSize=10");

  const {
    data: todayBookings,
    loading: todayLoading,
  } = useApi<BookingsResponse>(
    "/api/bookings?status=CONFIRMED&date=today&page=1&pageSize=50"
  );

  const { data: recentBookings, loading: recentLoading } =
    useApi<BookingsResponse>("/api/bookings?page=1&pageSize=5");

  const { data: rfm } = useApi<RfmStats[]>("/api/analytics/rfm");
  const { data: referrals } = useApi<ReferralStats>("/api/analytics/referral-stats");

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  /* ─── Actions ─── */

  async function handleStatusChange(id: string, status: "CONFIRMED" | "CANCELLED") {
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await api.patch(`/api/bookings/${id}/status`, { status });
      await refetchPending();
    } catch (err) {
      console.error("Failed to update booking status:", err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  /* ─── Today's schedule grouped by venue ─── */

  const scheduleByVenue: Record<string, Array<{ time: string; client: string }>> = {};
  if (todayBookings?.data) {
    for (const b of todayBookings.data) {
      if (!scheduleByVenue[b.venueName]) {
        scheduleByVenue[b.venueName] = [];
      }
      scheduleByVenue[b.venueName].push({
        time: `${b.startTime}\u2013${b.endTime}`,
        client: b.clientName,
      });
    }
  }

  /* ─── Render ─── */

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {"\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0434\u0430\u0448\u0431\u043E\u0440\u0434"}
        </h1>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString("ru-RU", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* ── Row 1: Key metrics ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title={"\u0411\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439 \u0441\u0435\u0433\u043E\u0434\u043D\u044F"}
          value={statsLoading ? "\u2014" : stats?.todayBookings ?? 0}
          subtitle={"\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044B"}
        />
        <StatCard
          title={"\u0412\u044B\u0440\u0443\u0447\u043A\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F"}
          value={statsLoading ? "\u2014" : formatCurrency(stats?.revenue ?? 0)}
          subtitle={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0431\u0440\u043E\u043D\u0438"}
        />
        <StatCard
          title={"\u041E\u0436\u0438\u0434\u0430\u044E\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F"}
          value={statsLoading ? "\u2014" : stats?.pendingCount ?? 0}
          className={
            (stats?.pendingCount ?? 0) > 0 ? "ring-2 ring-amber-400" : undefined
          }
          subtitle={
            (stats?.pendingCount ?? 0) > 0
              ? "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435"
              : "\u0412\u0441\u0451 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E"
          }
        />
        <StatCard
          title={"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u043B\u043E\u0449\u0430\u0434\u043E\u043A"}
          value={statsLoading ? "\u2014" : `${stats?.utilization ?? 0}%`}
          subtitle={"\u041D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F"}
        />
      </div>

      {/* ── Row 2: Pending bookings ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">{"\u23F3"}</span>
          {"\u041E\u0436\u0438\u0434\u0430\u044E\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F"}
          {(pendingBookings?.data?.length ?? 0) > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-800">
              {pendingBookings!.data.length}
            </span>
          )}
        </h2>

        {pendingLoading ? (
          <div className="text-center py-8 text-gray-400">
            {"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..."}
          </div>
        ) : !pendingBookings?.data?.length ? (
          <div className="text-center py-8 text-gray-500 text-lg">
            {"\u2705 \u0412\u0441\u0435 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingBookings.data.map((booking) => (
              <div
                key={booking.id}
                className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {booking.clientName}
                    </p>
                    <p className="text-sm text-gray-600">{booking.venueName}</p>
                  </div>
                  <StatusBadge status="PENDING" />
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>{formatDate(booking.date)}</span>
                  <span>
                    {booking.startTime} \u2013 {booking.endTime}
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {formatCurrency(booking.totalPrice)}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleStatusChange(booking.id, "CONFIRMED")}
                    disabled={actionLoading[booking.id]}
                    className={clsx(
                      "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                      actionLoading[booking.id]
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                    )}
                  >
                    {"\u2705"} {"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C"}
                  </button>
                  <button
                    onClick={() => handleStatusChange(booking.id, "CANCELLED")}
                    disabled={actionLoading[booking.id]}
                    className={clsx(
                      "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                      actionLoading[booking.id]
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-white text-red-600 border border-red-300 hover:bg-red-50 active:bg-red-100"
                    )}
                  >
                    {"\u274C"} {"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Row 3: Today's schedule ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {"\uD83D\uDCC5 \u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F"}
        </h2>

        {todayLoading ? (
          <div className="text-center py-6 text-gray-400">
            {"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..."}
          </div>
        ) : Object.keys(scheduleByVenue).length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            {"\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043D\u0435\u0442 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439"}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(scheduleByVenue).map(([venue, slots]) => (
              <div key={venue} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-500" />
                <div>
                  <p className="font-semibold text-gray-900">{venue}</p>
                  <p className="text-sm text-gray-600">
                    {slots.map((s, i) => (
                      <span key={i}>
                        {i > 0 && ", "}
                        <span className="font-medium">{s.time}</span>{" "}
                        {s.client}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Row 4: Quick stats (2 columns) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RFM Segments */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {"\uD83D\uDCCA RFM-\u0441\u0435\u0433\u043C\u0435\u043D\u0442\u044B"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {rfm?.map((segment) => (
              <div
                key={segment.segment}
                className="text-center p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors"
              >
                <div className="text-xl mb-0.5">
                  {getSegmentEmoji(segment.segment)}
                </div>
                <div className="font-medium text-xs text-gray-700">
                  {getSegmentName(segment.segment)}
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {segment.count}
                </div>
                <div className="text-xs text-gray-500">
                  {segment.percentage.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top referrers */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {"\uD83D\uDD17 \u0422\u043E\u043F \u0440\u0435\u0444\u0435\u0440\u0430\u043B\u044B"}
          </h2>
          {referrals?.topReferrers?.length ? (
            <div className="space-y-3">
              {referrals.topReferrers.slice(0, 5).map((r, idx) => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-5">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-gray-900">{r.name}</span>
                    <span className="text-xs text-gray-500">({r.code})</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {r.referrals} {"\u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0439"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-gray-500 text-sm">
              {"\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445"}
            </p>
          )}
          {referrals?.viralCoefficient != null && (
            <div className="mt-4 pt-4 border-t text-sm text-gray-500">
              {"\u0412\u0438\u0440\u0443\u0441\u043D\u044B\u0439 \u043A\u043E\u044D\u0444\u0444\u0438\u0446\u0438\u0435\u043D\u0442: "}
              <span className="font-semibold text-gray-900">
                {referrals.viralCoefficient.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Recent activity ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {"\uD83D\uDD54 \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F"}
        </h2>

        {recentLoading ? (
          <div className="text-center py-6 text-gray-400">
            {"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..."}
          </div>
        ) : !recentBookings?.data?.length ? (
          <p className="text-center py-6 text-gray-500">
            {"\u041D\u0435\u0442 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0439"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">{"\u041A\u043B\u0438\u0435\u043D\u0442"}</th>
                  <th className="pb-3 pr-4">{"\u041F\u043B\u043E\u0449\u0430\u0434\u043A\u0430"}</th>
                  <th className="pb-3 pr-4">{"\u0414\u0430\u0442\u0430"}</th>
                  <th className="pb-3 pr-4">{"\u0412\u0440\u0435\u043C\u044F"}</th>
                  <th className="pb-3 pr-4">{"\u0421\u0443\u043C\u043C\u0430"}</th>
                  <th className="pb-3">{"\u0421\u0442\u0430\u0442\u0443\u0441"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentBookings.data.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {b.clientName}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{b.venueName}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {formatDate(b.date)}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {b.startTime} \u2013 {b.endTime}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-gray-900">
                      {formatCurrency(b.totalPrice)}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
