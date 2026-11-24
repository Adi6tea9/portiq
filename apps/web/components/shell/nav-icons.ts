import {
  BarChart3,
  Container,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

/** One icon per page, shared by the sidebar, the help guide and page headers. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Shipments: Package,
  Predictions: Sparkles,
  Capacity: BarChart3,
  "Load planner": Container,
  "Operator overview": Users,
  Tariffs: Receipt,
  Settings: Settings,
};
