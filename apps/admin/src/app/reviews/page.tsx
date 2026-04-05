"use client";

import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

interface Review {
  id: string;
  clientName: string;
  clientId: string;
  venueName: string;
  venueId: string;
  rating: number;
  comment: string;
  isPublic: boolean;
  adminReply: string | null;
  createdAt: string;
}

interface Venue {
  id: string;
  name: string;
}

export default function ReviewsPage() {
  const [venueFilter, setVenueFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [publicFilter, setPublicFilter] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (venueFilter) params.set("venueId", venueFilter);
    if (ratingFilter) params.set("rating", ratingFilter);
    if (publicFilter) params.set("isPublic", publicFilter);
    return params.toString();
  }, [venueFilter, ratingFilter, publicFilter]);

  const { data: reviews, loading, refetch } = useApi<Review[]>(
    `/api/reviews?${queryParams}`,
    [queryParams]
  );
  const { data: venues } = useApi<Venue[]>("/api/venues");

  const togglePublic = async (id: string, current: boolean) => {
    await api.patch(`/api/reviews/${id}`, { isPublic: !current });
    refetch();
  };

  const sendReply = async (id: string) => {
    if (!replyText.trim()) return;
    await api.patch(`/api/reviews/${id}`, { adminReply: replyText });
    setReplyingTo(null);
    setReplyText("");
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Отзывы</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-gray-200">
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
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Любой рейтинг</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} &#9733;{r > 1 ? "" : ""}
            </option>
          ))}
        </select>
        <select
          value={publicFilter}
          onChange={(e) => setPublicFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все</option>
          <option value="true">Публичные</option>
          <option value="false">Скрытые</option>
        </select>
        <div className="text-sm text-gray-500 flex items-center">
          {reviews ? `Найдено: ${reviews.length}` : ""}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Загрузка...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 text-left font-medium text-gray-600">Клиент</th>
                <th className="p-3 text-left font-medium text-gray-600">Площадка</th>
                <th className="p-3 text-center font-medium text-gray-600">
                  Рейтинг
                </th>
                <th className="p-3 text-left font-medium text-gray-600">
                  Комментарий
                </th>
                <th className="p-3 text-left font-medium text-gray-600">Дата</th>
                <th className="p-3 text-center font-medium text-gray-600">
                  Публичный
                </th>
                <th className="p-3 text-center font-medium text-gray-600">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              {reviews?.map((review) => (
                <>
                  <tr
                    key={review.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="p-3">
                      <a
                        href={`/clients/${review.clientId}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        {review.clientName}
                      </a>
                    </td>
                    <td className="p-3 text-gray-600">{review.venueName}</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= review.rating
                                ? "text-yellow-400"
                                : "text-gray-300"
                            }`}
                          >
                            &#9733;
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-gray-700 max-w-md">
                      <p className="truncate">{review.comment}</p>
                      {review.adminReply && (
                        <p className="text-xs text-blue-600 mt-1 truncate">
                          Ответ: {review.adminReply}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">
                      {new Date(review.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() =>
                          togglePublic(review.id, review.isPublic)
                        }
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          review.isPublic ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            review.isPublic
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setReplyingTo(
                            replyingTo === review.id ? null : review.id
                          );
                          setReplyText(review.adminReply || "");
                        }}
                        className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
                      >
                        {review.adminReply ? "Изменить ответ" : "Ответить"}
                      </button>
                    </td>
                  </tr>
                  {replyingTo === review.id && (
                    <tr key={`reply-${review.id}`} className="border-b border-gray-100">
                      <td colSpan={7} className="p-3 bg-blue-50/50">
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Ваш ответ клиенту..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) =>
                              e.key === "Enter" && sendReply(review.id)
                            }
                          />
                          <button
                            onClick={() => sendReply(review.id)}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                          >
                            Отправить
                          </button>
                          <button
                            onClick={() => setReplyingTo(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            Отмена
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {reviews?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    Отзывы не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
