import { InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";
import { formatPrice } from "@studio/utils";

/**
 * Generate a keyboard showing venue addons with toggle/quantity controls.
 * selectedAddons is a map of addonId -> quantity.
 */
export async function generateAddonsKeyboard(
  venueId: string,
  selectedAddons: Record<string, number>,
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard();

  const addons = await prisma.addon.findMany({
    where: {
      OR: [{ venueId }, { venueId: null }],
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  if (addons.length === 0) {
    keyboard.text("Нет доступных допуслуг", "cal_noop").row();
    keyboard.text("Пропустить ▶️", "addons_skip");
    keyboard.row();
    keyboard.text("◀️ Назад", "booking_back:duration");
    return keyboard;
  }

  for (const addon of addons) {
    const currentQty = selectedAddons[addon.id] || 0;
    const priceLabel =
      addon.priceType === "PER_HOUR"
        ? `${formatPrice(Number(addon.price))}/ч`
        : formatPrice(Number(addon.price));

    if (addon.maxQuantity <= 1) {
      // Simple toggle
      const icon = currentQty > 0 ? "☑" : "☐";
      keyboard
        .text(`${icon} ${addon.name} — ${priceLabel}`, `addon_toggle:${addon.id}`)
        .row();
    } else {
      // Quantity controls
      const icon = currentQty > 0 ? "☑" : "☐";
      keyboard.text(`${icon} ${addon.name} — ${priceLabel}`, `addon_toggle:${addon.id}`).row();
      keyboard
        .text("➖", `addon_qty:${addon.id}:-`)
        .text(`${currentQty}`, "cal_noop")
        .text("➕", `addon_qty:${addon.id}:+`)
        .row();
    }
  }

  keyboard.text("Пропустить ▶️", "addons_skip").row();
  keyboard.text("✅ Готово", "addons_done").row();
  keyboard.text("◀️ Назад", "booking_back:duration");

  return keyboard;
}
