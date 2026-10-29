import type { AppConfig } from "../../api/types";

export const mockConfig: AppConfig = {
  capacity_thresholds: {
    moderate_pct: 60,
    high_pct: 85,
  },
  max_forecast_range_days: 31,
  default_bucket: "day",
};
