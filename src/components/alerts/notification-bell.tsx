import type { Route } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * NotificationBell — server-component die het bell-icoon in de top-bar
 * vervangt door een variant met unread-badge.
 *
 * Click → `/alerts` notification-center. Voor inline-popover (later)
 * kunnen we 'em upgraden naar een Sheet; voorlopig: click-through.
 */

interface Props {
  unreadCount: number;
  className?: string;
}

export function NotificationBell({ unreadCount, className }: Props) {
  return (
    <Link
      href={"/alerts" as Route}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground",
        className,
      )}
      aria-label={
        unreadCount > 0
          ? `${unreadCount} ongelezen notificaties`
          : "Notificaties"
      }
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular-nums"
          aria-hidden
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
