export interface SiteStatusSettings {
  underConstruction: boolean;
  underMaintenance: boolean;
  updatedAt: number;
}

export const DEFAULT_SITE_STATUS_SETTINGS: SiteStatusSettings = {
  underConstruction: true,
  underMaintenance: true,
  updatedAt: 0,
};

const STORAGE_KEY = "searchbiz_site_settings";

export function normalizeSiteStatusSettings(raw: any): SiteStatusSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SITE_STATUS_SETTINGS };
  }
  return {
    underConstruction:
      typeof raw.underConstruction === "boolean"
        ? raw.underConstruction
        : DEFAULT_SITE_STATUS_SETTINGS.underConstruction,
    underMaintenance:
      typeof raw.underMaintenance === "boolean"
        ? raw.underMaintenance
        : DEFAULT_SITE_STATUS_SETTINGS.underMaintenance,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function getStoredSiteSettings(): SiteStatusSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SITE_STATUS_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeSiteStatusSettings(JSON.parse(raw));
    }
  } catch {
    // Ignore storage read errors
  }
  return { ...DEFAULT_SITE_STATUS_SETTINGS };
}

export function saveStoredSiteSettings(settings: SiteStatusSettings): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeSiteStatusSettings(settings);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage write errors
  }
  window.dispatchEvent(
    new CustomEvent("searchbiz_site_settings_updated", { detail: normalized })
  );
}
