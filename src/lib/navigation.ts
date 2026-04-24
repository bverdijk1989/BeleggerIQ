import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Briefcase,
  CalendarClock,
  FlaskConical,
  LayoutDashboard,
  ShieldAlert,
  Telescope,
  TimerReset,
  UserCog,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: Route;
  icon: LucideIcon;
  description?: string;
  group: "analyse" | "beslissingen" | "onderzoek" | "account";
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Portefeuille-overzicht en kernmetrics",
    group: "analyse",
  },
  {
    label: "Portefeuille",
    href: "/portfolio",
    icon: Briefcase,
    description: "Posities, allocatie en kostprijzen",
    group: "analyse",
  },
  {
    label: "Risico",
    href: "/risico",
    icon: ShieldAlert,
    description: "Concentratie, drawdown en exposure",
    group: "analyse",
  },
  {
    label: "Maandbeslissing",
    href: "/maandbeslissing",
    icon: CalendarClock,
    description: "Wat koop je deze maand",
    group: "beslissingen",
  },
  {
    label: "Screener",
    href: "/screener",
    icon: Telescope,
    description: "Factor- en kwaliteitsscreening",
    group: "onderzoek",
  },
  {
    label: "Strategy Lab",
    href: "/strategy-lab",
    icon: FlaskConical,
    description: "Ontwerp en valideer strategieën",
    group: "onderzoek",
  },
  {
    label: "Backtest",
    href: "/backtest",
    icon: TimerReset,
    description: "Historische simulatie van strategieën",
    group: "onderzoek",
  },
  {
    label: "Chat",
    href: "/chat",
    icon: Bot,
    description: "AI-assistent met explainability",
    group: "onderzoek",
  },
  {
    label: "Profiel",
    href: "/profiel",
    icon: UserCog,
    description: "Beleggersprofiel en voorkeuren",
    group: "account",
  },
] as const;

export const NAV_GROUPS: Record<NavItem["group"], string> = {
  analyse: "Analyse",
  beslissingen: "Beslissingen",
  onderzoek: "Onderzoek",
  account: "Account",
};

export const SUPPORTING_ICONS = { BarChart3 };
