import fs from "fs";
import path from "path";
import {
  DEFAULT_SITE_STATUS_SETTINGS,
  SiteStatusSettings,
  normalizeSiteStatusSettings,
} from "@/lib/site-settings";

const DOT_SETTINGS_PATH = path.join(process.cwd(), ".data", "site-settings.json");
const DATA_SETTINGS_PATH = path.join(process.cwd(), "data", "site-settings.json");

const globalRef = globalThis as typeof globalThis & {
  __searchbizSiteSettings?: SiteStatusSettings;
};

export function getServerSiteSettings(): SiteStatusSettings {
  if (globalRef.__searchbizSiteSettings) {
    return globalRef.__searchbizSiteSettings;
  }

  for (const filePath of [DATA_SETTINGS_PATH, DOT_SETTINGS_PATH]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        const normalized = normalizeSiteStatusSettings(parsed);
        globalRef.__searchbizSiteSettings = normalized;
        return normalized;
      }
    } catch {
      // Try next file path
    }
  }

  const initial: SiteStatusSettings = {
    ...DEFAULT_SITE_STATUS_SETTINGS,
    updatedAt: Date.now(),
  };
  saveServerSiteSettings(initial);
  return initial;
}

export function saveServerSiteSettings(
  partial: Partial<SiteStatusSettings>
): SiteStatusSettings {
  const current = globalRef.__searchbizSiteSettings || {
    ...DEFAULT_SITE_STATUS_SETTINGS,
  };
  const next: SiteStatusSettings = {
    underConstruction:
      typeof partial.underConstruction === "boolean"
        ? partial.underConstruction
        : current.underConstruction,
    underMaintenance:
      typeof partial.underMaintenance === "boolean"
        ? partial.underMaintenance
        : current.underMaintenance,
    updatedAt: Date.now(),
  };

  globalRef.__searchbizSiteSettings = next;
  const serialized = JSON.stringify(next, null, 2);

  for (const filePath of [DOT_SETTINGS_PATH, DATA_SETTINGS_PATH]) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, serialized, "utf-8");
      fs.renameSync(tmpPath, filePath);
    } catch {
      // Best-effort write to both locations
    }
  }

  return next;
}
