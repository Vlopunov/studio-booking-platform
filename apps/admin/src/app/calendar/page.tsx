"use client";

import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface Venue {
  id: string;
  name: string;
}

interface CalendarBooking {
  id: string;
  humanId: string;
  clientName: string;
  startTime: string;
  endTime: string;
  date: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 9); // 09:00 - 22:00
const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-200 border-yellow-400 text-yellow-900",
  CONFIRMED: "bg-green-200 border-green-400 text-green-900",
  COMPLETED: "bg-gray-200 border-gray-400 text-gray-900",
  CANCELLED: "bg-red-200 border-red-400 text-red-900",
  NO_SHOW: "bg-purple-200 border-purple-400 text-purple-900",
};

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeVenueId, setActiveVenueId] = useState<string>("");
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
  const [createSlot, setCreateSlot] = useState<{ date: string; hour: number } | null>(null);

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const weekStart = formatDate(weekDates[0]);
  const weekEnd = formatDate(weekDates[6]);

  const { data: venues } = useApi<Venue[]>("/api/venues");

  const venueId = activeVenueId || venues?.[0]?.id || "";

  const { data: bookings } = useApi<CalendarBooking[]>(
    venueId
      ? `/api/bookings?venueId=${venueId}&dateFrom=${weekStart}&dateTo=${weekEnd}`
      : "",
    [venueId, weekStart, weekEnd]
  );

  const prevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const nextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const today = () => setCurrentDate(new Date());

  const getBookingsForSlot = (date: string, hour: number) => {
    return (bookings || []).filter((b) => {
      if (b.date !== date) return false;
      const startHour = parseInt(b.startTime.split(":")[0], 10);
      const endHour = parseInt(b.endTime.split(":")[0], 10);
      return hour >= startHour && hour < endHour;
    });
  };

  const getBookingSpan = (booking: CalendarBooking, hour: number) => {
    const startHour = parseInt(booking.startTime.split(":")[0], 10);
    if (startHour !== hour) return null;
    const endHour = parseInt(booking.endTime.split(":")[0], 10);
    return endHour - startHour;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Календарь</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={prevWeek}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            &larr; Пред. неделя
          </button>
          <button
            onClick={today}
            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Сегодня
          </button>
          <button
            onClick={nextWeek}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            След. неделя &rarr;
          </button>
        </div>
      </div>

      {/* Venue tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-3">
        {venues?.map((venue) => (
          <button
            key={venue.id}
            onClick={() => setActiveVenueId(venue.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              venueId === venue.id
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {venue.name}
          </button>
        ))}
      </div>

      {/* Week header */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[80px_repeat(7,1fr)]">
          <div className="bg-gray-50 border-b border-r border-gray-200 p-2" />
          {weekDates.map((date, i) => {
            const isToday = formatDate(date) === formatDate(new Date());
            return (
              <div
                key={i}
                className={`text-center py-3 border-b border-r border-gray-200 text-sm font-medium ${
                  isToday ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-700"
                }`}
              >
                <div>{DAY_NAMES[i]}</div>
                <div className={`text-lg ${isToday ? "font-bold" : ""}`}>
                  {formatDateShort(date)}
                </div>
              </div>
            );
          })}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <>
              <div
                key={`h-${hour}`}
                className="border-b border-r border-gray-200 p-2 text-xs text-gray-500 text-right pr-3 bg-gray-50"
              >
                {String(hour).padStart(2, "0")}:00
              </div>
              {weekDates.map((date, dayIdx) => {
                const dateStr = formatDate(date);
                const slotBookings = getBookingsForSlot(dateStr, hour);
                return (
                  <div
                    key={`${hour}-${dayIdx}`}
                    className="border-b border-r border-gray-200 p-0.5 min-h-[48px] relative cursor-pointer hover:bg-blue-50/50"
                    onClick={() => {
                      if (slotBookings.length === 0) {
                        setCreateSlot({ date: dateStr, hour });
                      }
                    }}
                  >
                    {slotBookings.map((booking) => {
                      const span = getBookingSpan(booking, hour);
                      if (span === null) return null;
                      return (
                        <div
                          key={booking.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBooking(booking);
                          }}
                          className={`absolute inset-x-0.5 rounded border text-xs p-1 cursor-pointer z-10 overflow-hidden ${STATUS_COLORS[booking.status]}`}
                          style={{ height: `${span * 48 - 4}px` }}
                        >
                          <div className="font-medium truncate">
                            {booking.clientName}
                          </div>
                          <div className="truncate opacity-75">
                            {booking.startTime}-{booking.endTime}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Booking detail popup */}
      {selectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedBooking(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                #{selectedBooking.humanId}
              </h3>
              <button
                onClick={() => setSelectedBooking(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">Клиент:</span>{" "}
                <span className="font-medium">{selectedBooking.clientName}</span>
              </p>
              <p>
                <span className="text-gray-500">Дата:</span>{" "}
                <span className="font-medium">{selectedBooking.date}</span>
              </p>
              <p>
                <span className="text-gray-500">Время:</span>{" "}
                <span className="font-medium">
                  {selectedBooking.startTime} - {selectedBooking.endTime}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Статус:</span>{" "}
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedBooking.status]}`}
                >
                  {selectedBooking.status}
                </span>
              </p>
            </div>
            <a
              href={`/bookings/${selectedBooking.id}`}
              className="block text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Подробнее
            </a>
          </div>
        </div>
      )}

      {/* Create booking modal */}
      {createSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setCreateSlot(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900">
              Новая бронь
            </h3>
            <p className="text-sm text-gray-600">
              {createSlot.date}, {String(createSlot.hour).padStart(2, "0")}:00
            </p>
            <div className="flex gap-3">
              <a
                href={`/bookings/new?venueId=${venueId}&date=${createSlot.date}&hour=${createSlot.hour}`}
                className="flex-1 text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Создать
              </a>
              <button
                onClick={() => setCreateSlot(null)}
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
