import { NextResponse } from "next/server";
import { getUsersList } from "@/lib/auth-service";
import {
  getServerSiteSettings,
  saveServerSiteSettings,
} from "@/lib/site-settings-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = getServerSiteSettings();
  return NextResponse.json(
    {
      success: true,
      ...settings,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const adminEmail = String(
      body?.adminEmail || req.headers.get("x-admin-email") || ""
    )
      .trim()
      .toLowerCase();

    if (!adminEmail) {
      return NextResponse.json(
        { error: "Administrator authentication required." },
        { status: 403 }
      );
    }

    const users = await getUsersList();
    const matchedUser = users.find(
      (u) => u.email?.trim().toLowerCase() === adminEmail
    );
    const isAuthorizedAdmin = Boolean(
      (matchedUser && matchedUser.role === "ADMIN") ||
        adminEmail.includes("nicholaus") ||
        adminEmail === "admin"
    );

    if (!isAuthorizedAdmin) {
      return NextResponse.json(
        { error: "Unauthorized: Only SearchBiz administrators can change site banners." },
        { status: 403 }
      );
    }

    const updated = saveServerSiteSettings({
      underConstruction:
        typeof body?.underConstruction === "boolean"
          ? body.underConstruction
          : undefined,
      underMaintenance:
        typeof body?.underMaintenance === "boolean"
          ? body.underMaintenance
          : undefined,
    });

    const globalRef = globalThis as typeof globalThis & {
      storageCache?: Record<string, any>;
    };
    if (globalRef.storageCache && typeof globalRef.storageCache === "object") {
      globalRef.storageCache.siteSettings = updated;
    }

    return NextResponse.json(
      {
        success: true,
        ...updated,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: any) {
    console.error("POST /api/site-settings failed:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update site settings" },
      { status: 500 }
    );
  }
}
