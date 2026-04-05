import type { Context, SessionFlavor } from "grammy";
import type { Client } from "@studio/database";

export interface BookingData {
  venueId?: string;
  date?: string;
  startTime?: string;
  durationHours?: number;
  selectedAddons?: Record<string, number>; // addonId -> quantity
  promocode?: string;
  bonusToSpend?: number;
  comment?: string;
  giftCertId?: string;
}

export interface SessionData {
  bookingStep: string | null;
  bookingData: BookingData;
}

export type StudioContext = Context &
  SessionFlavor<SessionData> & {
    client: Client;
  };
