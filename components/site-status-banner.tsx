"use client";

import React, { useEffect, useState } from "react";
import { Construction, Wrench } from "lucide-react";
import {
  DEFAULT_SITE_STATUS_SETTINGS,
  SiteStatusSettings,
  getStoredSiteSettings,
  normalizeSiteStatusSettings,
} from "@/lib/site-settings";

export function SiteStatusBanner() {
  const [settings, setSettings] = useState<SiteStatusSettings>(
    DEFAULT_SITE_STATUS_SETTINGS
  );

  useEffect(() => {
    let active = true;

    const stored = getStoredSiteSettings();
    if (stored.updatedAt > 0) {
      setSettings(stored);
    }

    fetch("/api/site-settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const normalized = normalizeSiteStatusSettings(data);
        setSettings(normalized);
        try {
          window.localStorage.setItem(
            "searchbiz_site_settings",
            JSON.stringify(normalized)
          );
        } catch {
          // Ignore storage write errors
        }
      })
      .catch(() => {
        // Keep current state if offline
      });

    const handleCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent<SiteStatusSettings>).detail;
      if (detail) {
        setSettings(normalizeSiteStatusSettings(detail));
      } else {
        setSettings(getStoredSiteSettings());
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "searchbiz_site_settings" && e.newValue) {
        try {
          setSettings(normalizeSiteStatusSettings(JSON.parse(e.newValue)));
        } catch {
          // Ignore malformed JSON
        }
      }
    };

    window.addEventListener("searchbiz_site_settings_updated", handleCustomUpdate);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      active = false;
      window.removeEventListener(
        "searchbiz_site_settings_updated",
        handleCustomUpdate
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const showConstruction = settings.underConstruction;
  const showMaintenance = settings.underMaintenance;

  if (!showConstruction && !showMaintenance) {
    return null;
  }

  return (
    <section
      aria-label="Site status notice"
      data-testid="site-status-banner"
      className="w-full bg-yellow-400 text-neutral-950 border-b-2 border-neutral-950 shadow-sm relative z-30"
    >
      <div
        aria-hidden="true"
        className="h-1.5 w-full bg-[repeating-linear-gradient(-45deg,#09090b_0px,#09090b_10px,#facc15_10px,#facc15_20px)]"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div
          className={`flex flex-col ${
            showConstruction && showMaintenance
              ? "lg:flex-row lg:items-center lg:justify-between gap-2.5 lg:gap-6"
              : "items-center justify-center"
          }`}
        >
          {showConstruction && (
            <div
              data-testid="under-construction-notice"
              className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left"
            >
              <span className="inline-flex items-center gap-1.5 bg-neutral-950 text-yellow-300 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider shrink-0">
                <Construction className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span>Under Construction</span>
              </span>
              <p className="text-xs sm:text-sm font-bold text-neutral-950 leading-snug">
                SearchBiz.co.za is currently under construction — new features and directory updates are being added.
              </p>
            </div>
          )}

          {showConstruction && showMaintenance && (
            <div
              aria-hidden="true"
              className="hidden lg:block w-0.5 h-5 bg-neutral-950/30 shrink-0"
            />
          )}

          {showMaintenance && (
            <div
              data-testid="under-maintenance-notice"
              className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left"
            >
              <span className="inline-flex items-center gap-1.5 bg-neutral-950 text-yellow-300 px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider shrink-0">
                <Wrench className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span>Under Maintenance</span>
              </span>
              <p className="text-xs sm:text-sm font-bold text-neutral-950 leading-snug">
                Scheduled system maintenance is currently active — some listings and tools are being updated.
              </p>
            </div>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="h-1.5 w-full bg-[repeating-linear-gradient(-45deg,#09090b_0px,#09090b_10px,#facc15_10px,#facc15_20px)]"
      />
    </section>
  );
}
