"use client";

import { useState, useMemo } from "react";
import { useApi } from "@/lib/hooks";

interface AuditEntry {
  id: string;
  timestamp: string;
  adminName: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
}

const ACTION_TYPES = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "STATUS_CHANGE",
  "LOGIN",
  "EXPORT",
  "BONUS_ADJUST",
];

const ENTITY_TYPES = [
  "BOOKING",
  "CLIENT",
  "VENUE",
  "PROMOCODE",
  "REVIEW",
  "CAMPAIGN",
  "LOYALTY_SETTINGS",
];

export default function AuditPage() {
  const [adminFilter, setAdminFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (adminFilter) params.set("adminName", adminFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entityType", entityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [adminFilter, actionFilter, entityFilter, dateFrom, dateTo]);

  const { data: auditResponse, loading, error } = useApi<{ data: AuditEntry[]; total: number }>(
    `/api/audit?${queryParams}`,
    [queryParams]
  );
  const entries = auditResponse?.data ?? null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Журнал аудита</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <input
          type="text"
          placeholder="Имя администратора"
          value={adminFilter}
          onChange={(e) => setAdminFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все действия</option>
          {ACTION_TYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все сущности</option>
          {ENTITY_TYPES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
        ) : !entries || entries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Записи аудита не найдены</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 text-left font-medium text-gray-600">
                  Время
                </th>
                <th className="p-3 text-left font-medium text-gray-600">
                  Администратор
                </th>
                <th className="p-3 text-left font-medium text-gray-600">
                  Действие
                </th>
                <th className="p-3 text-left font-medium text-gray-600">
                  Сущность
                </th>
                <th className="p-3 text-left font-medium text-gray-600">
                  ID сущности
                </th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    onClick={() =>
                      setExpandedRow(
                        expandedRow === entry.id ? null : entry.id
                      )
                    }
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="p-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString("ru-RU")}
                    </td>
                    <td className="p-3 font-medium text-gray-900">
                      {entry.adminName}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {entry.action}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">{entry.entityType}</td>
                    <td className="p-3 font-mono text-xs text-gray-500">
                      {entry.entityId}
                    </td>
                  </tr>
                  {expandedRow === entry.id && (
                    <tr key={`detail-${entry.id}`} className="border-b border-gray-100">
                      <td colSpan={5} className="p-4 bg-gray-50">
                        <div className="text-xs">
                          <span className="font-medium text-gray-700">
                            Детали:
                          </span>
                          <pre className="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg overflow-x-auto">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
