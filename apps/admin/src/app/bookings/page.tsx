"use client";

import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface Booking {
  id: string;
  humanId: string;
  clientName: string;
  clientPhone: string;
  venueName: string;
  venueId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  totalPrice: number;
}

interface Venue {
  id: string;
  name: string;
}

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Ожидает" },
  CONFIRMED: { bg: "bg-green-100", text: "text-green-800", label: "Подтверждено" },
  COMPLETED: { bg: "bg-gray-100", text: "text-gray-800", label: "Завершено" },
  CANCELLED: { bg: "bg-red-100", text: "text-red-800", label: "Отменено" },
  NO_SHOW: { bg: "bg-purple-100", text: "text-purple-800", label: "Неявка" },
};

const ALL_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

export default function BookingsPage() {
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (venueFilter) params.set("venueId", venueFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [search, venueFilter, statusFilter, dateFrom, dateTo]);

  const { data: bookingsResponse, loading, error, refetch } = useApi<{ data: Booking[]; total: number }>(
    `/api/bookings?${queryParams}`,
    [queryParams]
  );
  const bookings = bookingsResponse?.data ?? null;
  const { data: venues } = useApi<Venue[]>("/api/venues");

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!bookings) return;
    if (selected.size === bookings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(bookings.map((b) => b.id)));
    }
  };

  const massAction = async (action: "confirm" | "cancel") => {
    if (selected.size === 0) return;
    const status = action === "confirm" ? "CONFIRMED" : "CANCELLED";
    await Promise.all(
      Array.from(selected).map((id) =>
        api.patch(`/api/bookings/${id}/status`, { status })
      )
    );
    setSelected(new Set());
    refetch();
  };

  const exportCSV = () => {
    if (!bookings) return;
    const headers = ["ID", "Клиент", "Площадка", "Дата", "Время", "Статус", "Цена"];
    const rows = bookings.map((b) => [
      b.humanId,
      b.clientName,
      b.venueName,
      b.date,
      `${b.startTime}-${b.endTime}`,
      b.status,
      b.totalPrice,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Бронирования</h1>
        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Экспорт CSV
          </button>
          <a
            href="/bookings/new"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Создать бронь вручную
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <input
          type="text"
          placeholder="Поиск по имени, телефону..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={venueFilter}
          onChange={(e) => setVenueFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все площадки</option>
          {venues?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все статусы</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_BADGES[s].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="От"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="До"
        />
      </div>

      {/* Mass actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 bg-blue-50 p-3 rounded-lg">
          <span className="text-sm text-blue-800 font-medium">
            Выбрано: {selected.size}
          </span>
          <button
            onClick={() => massAction("confirm")}
            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200"
          >
            Подтвердить все
          </button>
          <button
            onClick={() => massAction("cancel")}
            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
          >
            Отменить все
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-2" />
            <p>Загрузка...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">
            <p className="font-medium">Ошибка загрузки</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Пока нет бронирований</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={bookings ? selected.size === bookings.length && bookings.length > 0 : false}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="p-3 text-left font-medium text-gray-600">ID</th>
                <th className="p-3 text-left font-medium text-gray-600">Клиент</th>
                <th className="p-3 text-left font-medium text-gray-600">Площадка</th>
                <th className="p-3 text-left font-medium text-gray-600">Дата</th>
                <th className="p-3 text-left font-medium text-gray-600">Время</th>
                <th className="p-3 text-left font-medium text-gray-600">Статус</th>
                <th className="p-3 text-right font-medium text-gray-600">Цена</th>
              </tr>
            </thead>
            <tbody>
              {bookings?.map((booking) => {
                const badge = STATUS_BADGES[booking.status];
                return (
                  <tr
                    key={booking.id}
                    onClick={() => setDetailBooking(booking)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(booking.id)}
                        onChange={() => toggleSelect(booking.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="p-3 font-mono text-gray-500">{booking.humanId}</td>
                    <td className="p-3 font-medium text-gray-900">{booking.clientName}</td>
                    <td className="p-3 text-gray-600">{booking.venueName}</td>
                    <td className="p-3 text-gray-600">{booking.date}</td>
                    <td className="p-3 text-gray-600">
                      {booking.startTime} - {booking.endTime}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-gray-900">
                      {booking.totalPrice.toLocaleString("ru-RU")} ₽
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {detailBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDetailBooking(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Бронь #{detailBooking.humanId}
              </h2>
              <button
                onClick={() => setDetailBooking(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Клиент</span>
                <p className="font-medium">{detailBooking.clientName}</p>
              </div>
              <div>
                <span className="text-gray-500">Площадка</span>
                <p className="font-medium">{detailBooking.venueName}</p>
              </div>
              <div>
                <span className="text-gray-500">Дата</span>
                <p className="font-medium">{detailBooking.date}</p>
              </div>
              <div>
                <span className="text-gray-500">Время</span>
                <p className="font-medium">
                  {detailBooking.startTime} - {detailBooking.endTime}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Статус</span>
                <p>
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[detailBooking.status].bg} ${STATUS_BADGES[detailBooking.status].text}`}
                  >
                    {STATUS_BADGES[detailBooking.status].label}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-gray-500">Стоимость</span>
                <p className="font-medium">
                  {detailBooking.totalPrice.toLocaleString("ru-RU")} ₽
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <a
                href={`/bookings/${detailBooking.id}`}
                className="flex-1 text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Подробнее
              </a>
              <button
                onClick={() => setDetailBooking(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
