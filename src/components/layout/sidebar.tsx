"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/lib/navigation";
import { Logo } from "@/components/brand/logo";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const grouped = NAV_ITEMS.reduce<Record<NavItem["group"], NavItem[]>>(
    (acc, item) => {
      const bucket = acc[item.group] ?? [];
      bucket.push(item);
      acc[item.group] = bucket;
      return acc;
    },
    { analyse: [], beslissingen: [], onderzoek: [], account: [] },
  );

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-border/60 bg-surface",
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-border/60 px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {(Object.keys(grouped) as NavItem["group"][]).map((groupKey) => {
          const items = grouped[groupKey];
          if (items.length === 0) return null;
          return (
            <div key={groupKey}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {NAV_GROUPS[groupKey]}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname?.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-surface-elevated text-foreground"
                            : "text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border/60 p-4">
        <div className="rounded-md bg-surface-elevated/70 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Langetermijnfocus</p>
          <p className="mt-1 leading-relaxed">
            Geen ruis. Alleen signalen die er voor jouw horizon toe doen.
          </p>
        </div>
      </div>
    </aside>
  );
}
