"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const navigation = [
  { name: "Дашборд", href: "/", icon: "📊" },
  { name: "Бронирования", href: "/bookings", icon: "📋" },
  { name: "Календарь", href: "/calendar", icon: "📅" },
  { name: "Площадки", href: "/venues", icon: "🏠" },
  { name: "Клиенты", href: "/clients", icon: "👥" },
  { name: "Кампании", href: "/campaigns", icon: "📣" },
  { name: "Автосообщения", href: "/auto-messages", icon: "🤖" },
  { name: "Сертификаты", href: "/gift-certificates", icon: "🎁" },
  { name: "Промокоды", href: "/promocodes", icon: "🏷️" },
  { name: "Лояльность", href: "/loyalty", icon: "⭐" },
  { name: "Отзывы", href: "/reviews", icon: "💬" },
  {
    name: "Аналитика",
    icon: "📈",
    children: [
      { name: "Источники", href: "/analytics/sources" },
      { name: "RFM-анализ", href: "/analytics/rfm" },
      { name: "Когорты", href: "/analytics/cohort" },
      { name: "Маркетинг", href: "/analytics/marketing" },
    ],
  },
  { name: "Аудит", href: "/audit", icon: "🔍" },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen p-4 flex flex-col">
      <div className="text-xl font-bold mb-8 px-3">
        📸 Studio Admin
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {navigation.map((item) =>
          item.children ? (
            <div key={item.name}>
              <div className="px-3 py-2 text-sm font-medium text-gray-400 uppercase tracking-wider">
                {item.icon} {item.name}
              </div>
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className={clsx(
                    "block px-3 py-2 ml-6 rounded-md text-sm",
                    isActive(child.href)
                      ? "bg-gray-700 text-white"
                      : "text-gray-300 hover:bg-gray-800"
                  )}
                >
                  {child.name}
                </Link>
              ))}
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href!}
              className={clsx(
                "flex items-center px-3 py-2 rounded-md text-sm font-medium",
                isActive(item.href!)
                  ? "bg-gray-700 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              )}
            >
              <span className="mr-2">{item.icon}</span>
              {item.name}
            </Link>
          )
        )}
      </nav>

      <button
        onClick={() => {
          localStorage.removeItem("auth_token");
          window.location.href = "/login";
        }}
        className="mt-4 px-3 py-2 text-sm text-gray-400 hover:text-white"
      >
        Выход
      </button>
    </aside>
  );
}
