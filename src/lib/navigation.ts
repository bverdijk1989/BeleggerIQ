import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  CalendarClock,
  Eye,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Receipt,
  ShieldAlert,
  Sparkles,
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
    label: "Transacties",
    href: "/transacties" as Route,
    icon: Receipt,
    description: "Broker-historie, realized PnL, dividenden, fees",
    group: "analyse",
  },
  {
    label: "Belasting",
    href: "/belasting" as Route,
    icon: FileText,
    description: "Box-3 peildatum, bronbelasting, exporteerbaar voor aangifte",
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
    label: "Kansen",
    href: "/kansen",
    icon: Sparkles,
    description: "Opportunity radar over portefeuille, screener en watchlist",
    group: "onderzoek",
  },
  {
    label: "Screener",
    href: "/screener",
    icon: Telescope,
    description: "Factor- en kwaliteitsscreening",
    group: "onderzoek",
  },
  {
    label: "Watchlist",
    href: "/watchlist" as Route,
    icon: Eye,
    description: "Tickers die je volgt — quote, score en price-alerts",
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
  {
    label: "Methodologie",
    href: "/methodologie" as Route,
    icon: BookOpen,
    description: "Hoe een advies tot stand komt — engines, formules, thresholds",
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
