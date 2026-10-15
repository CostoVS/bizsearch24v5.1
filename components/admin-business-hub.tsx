"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Building2,
  Mail,
  Send,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Phone,
  MessageSquare,
  Globe,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  RefreshCw,
  FileText,
  AtSign,
  Sparkles,
  ShieldCheck,
  Check,
  Clock,
  Briefcase,
  Layers,
  SendHorizontal,
  History,
  Copy
} from "lucide-react";
import { SA_PROVINCES, getPostalCodeForTown } from "@/lib/locations";
import { CATEGORIES } from "@/lib/categories";

interface BusinessRecord {
  id: string;
  title: string;
  category?: string;
  categoryCode?: string;
  province?: string;
  provinceName?: string;
  city?: string;
  town?: string;
  suburb?: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  telephone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  tradingHours?: string;
  servicesOffered?: string;
  description?: string;
  source?: string;
  isApproved?: boolean;
  verified?: boolean;
  status?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  tiktok?: string;
  youtube?: string;
  createdAt?: string | number;
}

interface AdminBusinessHubProps {
  ads: BusinessRecord[];
  onRefreshAds?: () => void;
}

const SENDER_EMAIL = "admin@searchbiz.co.za";

const PRESET_TEMPLATES = [
  {
    id: "welcome_verification",
    title: "Welcome & Directory Verification Notice",
    subject: "Official Verification & Directory Listing on SearchBiz.co.za - {business_name}",
    body: `Dear {business_name} Management,\n\nWe are pleased to inform you that your business profile is indexed in the official SearchBiz.co.za South African directory for {suburb}, {city}.\n\nYour current registered listing details:\n• Business Name: {business_name}\n• Category: {category}\n• Service Area: {suburb}, {city} ({postal_code})\n• Region: {province}\n\nSearchBiz connects local customers looking for trusted, accredited service providers directly with vetted businesses in your area.\n\nTo review your listing or update your operating hours, phone numbers, and services offered, please reply directly to this email or visit SearchBiz.co.za.\n\nWarm regards,\nSearchBiz Administration Team\nadmin@searchbiz.co.za\nhttps://searchbiz.co.za`
  },
  {
    id: "premium_upgrade",
    title: "Elite Premium Membership (R199/mo) Proposal",
    subject: "Boost Local Customer Inquiries for {business_name} in {city}",
    body: `Hello {business_name} Team,\n\nDid you know that thousands of South African consumers and procurement managers search SearchBiz.co.za monthly for {category} providers in {city}?\n\nAs a verified business, you are eligible for the SearchBiz Elite Premium Membership at R199.00 / month:\n• Unlimited static website hosting included\n• Unlimited domain-branded email addresses (e.g. info@yourdomain.co.za)\n• Top-ranked priority placement in {city} and {suburb}\n• Direct WhatsApp and call inquiries with zero platform commissions\n• Official Gold Verified Business Badge\n\nTo activate your Elite Premium placement or request an upgrade, simply reply to this email (admin@searchbiz.co.za) or contact our administrator desk.\n\nBest regards,\nSearchBiz Accounts & Partnerships\nadmin@searchbiz.co.za`
  },
  {
    id: "update_details",
    title: "Request for Trading Hours & Contact Details Update",
    subject: "Please confirm your trading hours and contact details - {business_name}",
    body: `Dear {business_name},\n\nWe are currently refreshing our regional business index for {city} to provide accurate operating hours and emergency contact details to South African clients.\n\nPlease take a quick moment to reply to this email confirming:\n1. Your primary contact phone / WhatsApp number\n2. Current weekday and weekend trading hours\n3. Specialized services or new offerings\n\nKeeping your directory listing up to date guarantees higher visibility and direct customer referrals.\n\nThank you for being part of South Africa's trusted business community.\n\nWarm regards,\nSearchBiz Directory Administration\nadmin@searchbiz.co.za`
  },
  {
    id: "custom_blank",
    title: "Custom Message (Blank)",
    subject: "Communication from SearchBiz.co.za Administration - {business_name}",
    body: `Dear {business_name} Management,\n\n[Write your customized announcement, notice, or service offering here...]\n\nRegards,\nSearchBiz Administration\nadmin@searchbiz.co.za`
  }
];

export default function AdminBusinessHub({ ads = [], onRefreshAds }: AdminBusinessHubProps) {
  // Navigation within Hub
  const [activeSubTab, setActiveSubTab] = useState<"directory" | "email" | "logs">("directory");

  // Filter States for Directory
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filterHasEmailOnly, setFilterHasEmailOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Selected Business for Detail Modal
  const [activeBusinessModal, setActiveBusinessModal] = useState<BusinessRecord | null>(null);

  // Email Composer States
  const [emailTargetType, setEmailTargetType] = useState<"all" | "province" | "category" | "single">("all");
  const [emailTargetProvince, setEmailTargetProvince] = useState("gauteng");
  const [emailTargetCategory, setEmailTargetCategory] = useState(CATEGORIES[0] || "Building & Trades");
  const [emailSingleTarget, setEmailSingleTarget] = useState<BusinessRecord | null>(null);
  const [manualSingleEmail, setManualSingleEmail] = useState("");
  const [manualSingleName, setManualSingleName] = useState("");

  const [selectedTemplateId, setSelectedTemplateId] = useState("welcome_verification");
  const [emailSubject, setEmailSubject] = useState(PRESET_TEMPLATES[0].subject);
  const [emailBody, setEmailBody] = useState(PRESET_TEMPLATES[0].body);

  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [broadcastLogs, setBroadcastLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Fetch Broadcast Logs
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch("/api/admin/broadcast-email");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setBroadcastLogs(data.logs);
        }
      }
    } catch (e) {
      console.error("Failed to load broadcast logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filtered Businesses List
  const filteredBusinesses = useMemo(() => {
    let result = ads || [];

    if (filterHasEmailOnly) {
      result = result.filter(b => b.email && b.email.includes("@"));
    }

    if (selectedProvince !== "all") {
      result = result.filter(b => (b.province || "").toLowerCase() === selectedProvince.toLowerCase());
    }

    if (selectedCategory !== "all") {
      result = result.filter(b => (b.category || "").toLowerCase() === selectedCategory.toLowerCase());
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(b =>
        (b.title || "").toLowerCase().includes(term) ||
        (b.email || "").toLowerCase().includes(term) ||
        (b.phone || "").toLowerCase().includes(term) ||
        (b.whatsapp || "").toLowerCase().includes(term) ||
        (b.city || "").toLowerCase().includes(term) ||
        (b.suburb || "").toLowerCase().includes(term) ||
        (b.postalCode || "").toLowerCase().includes(term) ||
        (b.address || "").toLowerCase().includes(term) ||
        (b.category || "").toLowerCase().includes(term) ||
        (b.servicesOffered || "").toLowerCase().includes(term)
      );
    }

    return result;
  }, [ads, searchTerm, selectedProvince, selectedCategory, filterHasEmailOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredBusinesses.length / itemsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedBusinesses = filteredBusinesses.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  // Recipient Target List Calculation for Email Broadcaster
  const emailTargetRecipients = useMemo(() => {
    const listWithEmail = (ads || []).filter(b => b.email && b.email.includes("@"));

    if (emailTargetType === "all") {
      return listWithEmail;
    }
    if (emailTargetType === "province") {
      return listWithEmail.filter(b => (b.province || "").toLowerCase() === emailTargetProvince.toLowerCase());
    }
    if (emailTargetType === "category") {
      return listWithEmail.filter(b => (b.category || "").toLowerCase() === emailTargetCategory.toLowerCase());
    }
    if (emailTargetType === "single") {
      if (emailSingleTarget) {
        return [emailSingleTarget];
      }
      if (manualSingleEmail && manualSingleEmail.includes("@")) {
        return [{
          id: "manual",
          title: manualSingleName || "Valued Business Partner",
          email: manualSingleEmail,
          city: "South Africa",
          province: "Gauteng",
          suburb: "Central",
          postalCode: "2000",
          category: "Business Services"
        }];
      }
      return [];
    }
    return [];
  }, [ads, emailTargetType, emailTargetProvince, emailTargetCategory, emailSingleTarget, manualSingleEmail, manualSingleName]);

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const t = PRESET_TEMPLATES.find(x => x.id === templateId);
    if (t) {
      setEmailSubject(t.subject);
      setEmailBody(t.body);
    }
  };

  // Helper to insert token into body
  const insertToken = (token: string) => {
    setEmailBody(prev => prev + ` ${token} `);
  };

  // Switch to email tab with targeted business
  const handleTargetSingleBusiness = (business: BusinessRecord) => {
    setEmailTargetType("single");
    setEmailSingleTarget(business);
    setManualSingleEmail(business.email || "");
    setManualSingleName(business.title || "");
    setActiveSubTab("email");
  };

  // Execute Email Dispatch
  const handleSendBroadcast = async (isTest: boolean = false) => {
    if (!emailSubject.trim()) {
      alert("Please enter an email subject line.");
      return;
    }
    if (!emailBody.trim()) {
      alert("Please enter the email message body.");
      return;
    }

    if (!isTest && emailTargetRecipients.length === 0) {
      alert("There are no valid recipient email addresses found in the selected target group. Please adjust your target filter.");
      return;
    }

    const confirmMsg = isTest
      ? `Send test preview email to ${SENDER_EMAIL}?`
      : `Are you sure you want to send this email to ${emailTargetRecipients.length.toLocaleString()} business(es) from ${SENDER_EMAIL}?`;

    if (!confirm(confirmMsg)) return;

    setIsSending(true);
    setSendStatus(null);

    try {
      const payload = {
        isTest,
        targetType: emailTargetType,
        targetFilter:
          emailTargetType === "province"
            ? emailTargetProvince
            : emailTargetType === "category"
            ? emailTargetCategory
            : emailTargetType === "single"
            ? (emailSingleTarget?.title || manualSingleEmail)
            : "All Businesses",
        subject: emailSubject,
        messageBody: emailBody,
        recipients: emailTargetRecipients.map(b => ({
          email: b.email,
          businessName: b.title,
          city: b.city || b.town,
          province: b.province,
          suburb: b.suburb,
          postalCode: b.postalCode,
          category: b.category
        }))
      };

      const res = await fetch("/api/admin/broadcast-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        setSendStatus({
          success: true,
          message: data.message || `Dispatched successfully to ${payload.recipients.length} recipients!`
        });
        loadLogs();
      } else {
        setSendStatus({
          success: false,
          message: data.error || "Failed to dispatch email."
        });
      }
    } catch (err: any) {
      setSendStatus({
        success: false,
        message: err.message || "Network error while dispatching email."
      });
    } finally {
      setIsSending(false);
    }
  };

  const totalIndexed = ads.length;
  const totalWithEmail = ads.filter(b => b.email && b.email.includes("@")).length;
  const totalVerified = ads.filter(b => b.verified || b.isApproved).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-emerald-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <Building2 className="w-3.5 h-3.5" />
              <span>South African Business Intelligence &amp; Direct Messaging</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
              All Businesses &amp; Direct Email Hub
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Explore complete stored details for all indexed businesses across South Africa. Broadcast automated updates or send individual targeted communications directly from{" "}
              <span className="font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                {SENDER_EMAIL}
              </span>.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col gap-3 shrink-0">
            {onRefreshAds && (
              <button
                type="button"
                onClick={onRefreshAds}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 transition border border-white/10 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Data</span>
              </button>
            )}
            <div className="px-4 py-2 rounded-xl bg-emerald-900/60 border border-emerald-600/30 text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Official Sender: {SENDER_EMAIL}</span>
            </div>
          </div>
        </div>

        {/* Quick KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-xs">
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Total Indexed Businesses</span>
            <span className="text-xl sm:text-2xl font-black text-white">{totalIndexed.toLocaleString()}</span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <span className="text-emerald-400 block text-[10px] font-bold uppercase tracking-wider">With Email Address</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-300">{totalWithEmail.toLocaleString()}</span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <span className="text-blue-400 block text-[10px] font-bold uppercase tracking-wider">Verified / Approved</span>
            <span className="text-xl sm:text-2xl font-black text-blue-300">{totalVerified.toLocaleString()}</span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <span className="text-amber-400 block text-[10px] font-bold uppercase tracking-wider">Active Provinces</span>
            <span className="text-xl sm:text-2xl font-black text-amber-300">9 Provinces</span>
          </div>
        </div>
      </div>

      {/* Hub Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveSubTab("directory")}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSubTab === "directory"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>All Businesses Directory ({filteredBusinesses.length.toLocaleString()})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("email")}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSubTab === "email"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <SendHorizontal className="w-4 h-4" />
          <span>Direct &amp; Auto Email Broadcaster</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab("logs");
            loadLogs();
          }}
          className={`py-3 px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
            activeSubTab === "logs"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Dispatch History ({broadcastLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: ALL BUSINESSES DIRECTORY & DETAILS VIEWER */}
      {activeSubTab === "directory" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Search */}
              <div className="md:col-span-2 relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search business name, email, phone, suburb, town, postal code..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Province Selector */}
              <div>
                <select
                  value={selectedProvince}
                  onChange={(e) => {
                    setSelectedProvince(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="all">All Provinces (South Africa)</option>
                  {SA_PROVINCES.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Selector */}
              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sub-Filters / Stats */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterHasEmailOnly}
                  onChange={(e) => {
                    setFilterHasEmailOnly(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Show only businesses with valid email addresses</span>
                </span>
              </label>

              <div className="text-slate-500 font-medium">
                Showing <strong className="text-slate-900">{filteredBusinesses.length.toLocaleString()}</strong> businesses
                {filterHasEmailOnly && <span className="text-emerald-700 font-bold ml-1">(Email verified)</span>}
              </div>
            </div>
          </div>

          {/* Business Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {paginatedBusinesses.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">No businesses match your current filters</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Try clearing your search query or switching province and category dropdowns.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Business &amp; Category</th>
                      <th className="py-3 px-4">Location &amp; Postal Code</th>
                      <th className="py-3 px-4">Contact Info</th>
                      <th className="py-3 px-4">Email Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {paginatedBusinesses.map((b) => {
                      const postal = b.postalCode || getPostalCodeForTown(b.city || b.town || "");
                      const hasEmail = Boolean(b.email && b.email.includes("@"));

                      return (
                        <tr key={b.id || Math.random().toString()} className="hover:bg-slate-50/80 transition-colors">
                          {/* Business & Category */}
                          <td className="py-3.5 px-4 min-w-[220px]">
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <span>{b.title || "Unnamed Business"}</span>
                              {b.verified && (
                                <span title="Verified">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                {b.category || "General Business"}
                              </span>
                              {b.categoryCode && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  #{b.categoryCode}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Location & Postal Code */}
                          <td className="py-3.5 px-4 min-w-[180px]">
                            <div className="flex items-center gap-1 text-slate-800 font-semibold">
                              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">
                                {b.suburb ? `${b.suburb}, ` : ""}{b.city || b.town || "Johannesburg"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                              <span className="capitalize">{b.province || "Gauteng"}</span>
                              {postal && (
                                <span className="font-mono font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px]">
                                  {postal}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Contact Info */}
                          <td className="py-3.5 px-4 min-w-[170px] space-y-0.5 text-[11px]">
                            {(b.phone || b.telephone || b.whatsapp) && (
                              <div className="flex items-center gap-1.5 text-slate-800">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{b.phone || b.telephone || b.whatsapp}</span>
                              </div>
                            )}
                            {b.website && (
                              <div className="flex items-center gap-1.5 text-emerald-700 truncate max-w-[180px]">
                                <Globe className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span className="truncate">{b.website.replace(/^https?:\/\//, "")}</span>
                              </div>
                            )}
                          </td>

                          {/* Email Status */}
                          <td className="py-3.5 px-4 min-w-[180px]">
                            {hasEmail ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <Mail className="w-3 h-3 text-emerald-600" />
                                  <span className="truncate max-w-[140px]">{b.email}</span>
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-slate-300" />
                                <span>No email registered</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right min-w-[160px]">
                            <div className="flex items-center justify-end gap-2">
                              {hasEmail && (
                                <button
                                  type="button"
                                  onClick={() => handleTargetSingleBusiness(b)}
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center gap-1 transition border border-emerald-200 cursor-pointer"
                                  title="Send direct email to this business"
                                >
                                  <Send className="w-3 h-3 text-emerald-600" />
                                  <span>Email</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setActiveBusinessModal(b)}
                                className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                title="View all stored details"
                              >
                                <Eye className="w-3 h-3 text-slate-500" />
                                <span>Details</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200 text-xs">
                <span className="text-slate-500">
                  Page <strong>{safePage}</strong> of <strong>{totalPages}</strong> ({filteredBusinesses.length.toLocaleString()} total)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DIRECT & AUTO EMAIL BROADCASTER */}
      {activeSubTab === "email" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Target & Config */}
          <div className="lg:col-span-1 space-y-6">
            {/* Sender Identity Card */}
            <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-200/90 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <AtSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Verified Sender</span>
                  <p className="font-mono font-bold text-sm text-emerald-950">{SENDER_EMAIL}</p>
                </div>
              </div>
              <p className="text-xs text-emerald-900/80 leading-relaxed">
                All communications sent through this dashboard are signed and delivered with the official administrator credentials of SearchBiz South Africa.
              </p>
            </div>

            {/* Target Selection Card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-600" />
                <span>Recipient Targeting</span>
              </h3>

              <div className="space-y-2 text-xs">
                {/* Option 1: All Businesses */}
                <label className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                  emailTargetType === "all" ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}>
                  <input
                    type="radio"
                    name="targetType"
                    checked={emailTargetType === "all"}
                    onChange={() => {
                      setEmailTargetType("all");
                      setEmailSingleTarget(null);
                    }}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">All Registered Businesses</span>
                    <span className="text-slate-500 text-[11px]">
                      Broadcast to every business indexed across South Africa with an email address.
                    </span>
                  </div>
                </label>

                {/* Option 2: By Province */}
                <label className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                  emailTargetType === "province" ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}>
                  <input
                    type="radio"
                    name="targetType"
                    checked={emailTargetType === "province"}
                    onChange={() => {
                      setEmailTargetType("province");
                      setEmailSingleTarget(null);
                    }}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="w-full">
                    <span className="font-bold text-slate-900 block">By Specific Province</span>
                    <span className="text-slate-500 text-[11px] block mb-2">
                      Target businesses in one chosen South African province.
                    </span>
                    {emailTargetType === "province" && (
                      <select
                        value={emailTargetProvince}
                        onChange={(e) => setEmailTargetProvince(e.target.value)}
                        className="w-full bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none"
                      >
                        {SA_PROVINCES.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>

                {/* Option 3: By Category */}
                <label className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                  emailTargetType === "category" ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}>
                  <input
                    type="radio"
                    name="targetType"
                    checked={emailTargetType === "category"}
                    onChange={() => {
                      setEmailTargetType("category");
                      setEmailSingleTarget(null);
                    }}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="w-full">
                    <span className="font-bold text-slate-900 block">By Trade Category</span>
                    <span className="text-slate-500 text-[11px] block mb-2">
                      Target specific trades or commercial industries.
                    </span>
                    {emailTargetType === "category" && (
                      <select
                        value={emailTargetCategory}
                        onChange={(e) => setEmailTargetCategory(e.target.value)}
                        className="w-full bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>

                {/* Option 4: Single Business (1 at a time) */}
                <label className={`flex items-start gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                  emailTargetType === "single" ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                }`}>
                  <input
                    type="radio"
                    name="targetType"
                    checked={emailTargetType === "single"}
                    onChange={() => setEmailTargetType("single")}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="w-full">
                    <span className="font-bold text-slate-900 block">Single Individual Business (1 at a time)</span>
                    <span className="text-slate-500 text-[11px] block mb-2">
                      Send to exactly one business or enter custom recipient email.
                    </span>
                    {emailTargetType === "single" && (
                      <div className="space-y-2 mt-2 pt-2 border-t border-emerald-200">
                        {emailSingleTarget ? (
                          <div className="p-2.5 bg-white rounded-xl border border-emerald-300 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-900 text-xs">{emailSingleTarget.title}</p>
                              <p className="text-[10px] text-emerald-700 font-mono">{emailSingleTarget.email}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEmailSingleTarget(null);
                                setManualSingleEmail("");
                                setManualSingleName("");
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Clear single target"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={manualSingleName}
                              onChange={(e) => setManualSingleName(e.target.value)}
                              placeholder="Business Name (e.g. Apex Electrical)"
                              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800"
                            />
                            <input
                              type="email"
                              value={manualSingleEmail}
                              onChange={(e) => setManualSingleEmail(e.target.value)}
                              placeholder="Business Email (e.g. info@apexelectrical.co.za)"
                              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {/* Recipient Counter Badge */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Calculated Recipients:</span>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-extrabold text-xs">
                  {emailTargetRecipients.length.toLocaleString()} Business(es)
                </span>
              </div>
            </div>

            {/* Template Selector Card */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Pre-built Templates</span>
              </h3>

              <div className="space-y-1.5 text-xs">
                {PRESET_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${
                      selectedTemplateId === tmpl.id
                        ? "bg-emerald-50 border-emerald-400 text-emerald-950 font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{tmpl.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Email Editor & Live Preview */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base font-display">
                    Compose &amp; Edit Broadcast Message
                  </h3>
                  <p className="text-slate-500 text-xs">
                    Sender: <span className="font-mono font-bold text-emerald-700">{SENDER_EMAIL}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendBroadcast(true)}
                    disabled={isSending}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    title="Send a sample test email to admin@searchbiz.co.za"
                  >
                    <Send className="w-3.5 h-3.5 text-slate-500" />
                    <span>Send Test Preview</span>
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {sendStatus && (
                <div className={`p-4 rounded-2xl text-xs font-semibold flex items-start gap-3 ${
                  sendStatus.success
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border border-rose-200 text-rose-900"
                }`}>
                  {sendStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <p className="flex-1">{sendStatus.message}</p>
                </div>
              )}

              {/* Subject Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Official Listing Verification on SearchBiz.co.za - {business_name}"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>

              {/* Variable Tokens Inserter */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Click to Insert Dynamic Personalization Variables:
                </span>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {[
                    "{business_name}",
                    "{city}",
                    "{suburb}",
                    "{postal_code}",
                    "{province}",
                    "{category}",
                    "{listing_url}"
                  ].map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => insertToken(token)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-mono font-bold transition border border-slate-200 cursor-pointer text-[10px]"
                    >
                      + {token}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Body Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Email Message Body (Plain Text &amp; Variables)
                </label>
                <textarea
                  rows={12}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                <div className="text-xs text-slate-500 font-medium">
                  Recipients: <strong className="text-slate-900">{emailTargetRecipients.length.toLocaleString()}</strong> business(es) selected.
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleSendBroadcast(false)}
                    disabled={isSending || emailTargetRecipients.length === 0}
                    className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Dispatching Emails from {SENDER_EMAIL}...</span>
                      </>
                    ) : (
                      <>
                        <SendHorizontal className="w-4 h-4" />
                        <span>
                          {emailTargetType === "single"
                            ? "Send 1 Email to Business"
                            : `Dispatch to ${emailTargetRecipients.length.toLocaleString()} Businesses`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Email Preview Card */}
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 shadow-inner space-y-4">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                Live Sample Recipient Preview
              </span>
              
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 text-xs">
                <div className="border-b border-emerald-500 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-base text-emerald-950 font-display">SearchBiz.co.za</h4>
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Official Administration Dispatch</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">From: {SENDER_EMAIL}</span>
                </div>

                <div className="space-y-1 text-slate-600">
                  <p><strong>To:</strong> sample_partner@business.co.za (Apex Services)</p>
                  <p><strong>Subject:</strong> {emailSubject.replace(/\{business_name\}/g, "Apex Services").replace(/\{city\}/g, "Johannesburg")}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl font-sans text-slate-700 whitespace-pre-wrap leading-relaxed text-xs border border-slate-100">
                  {emailBody
                    .replace(/\{business_name\}/g, "Apex Services")
                    .replace(/\{city\}/g, "Johannesburg")
                    .replace(/\{suburb\}/g, "Sandton")
                    .replace(/\{postal_code\}/g, "2196")
                    .replace(/\{province\}/g, "Gauteng")
                    .replace(/\{category\}/g, "Building & Trades")
                    .replace(/\{listing_url\}/g, "https://searchbiz.co.za/directory?q=Apex+Services")}
                </div>

                <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 text-center">
                  Dispatched via SearchBiz South Africa &bull; {SENDER_EMAIL} &bull; POPIA &amp; Direct Marketing Compliance
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DISPATCH LOGS & DELIVERY AUDIT */}
      {activeSubTab === "logs" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base font-display">Email Dispatch Audit Logs</h3>
              <p className="text-slate-500 text-xs">Historical log of bulk and individual emails sent from {SENDER_EMAIL}.</p>
            </div>
            <button
              type="button"
              onClick={loadLogs}
              disabled={isLoadingLogs}
              className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? "animate-spin" : ""}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          {broadcastLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <History className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-xs font-semibold">No emails have been dispatched from this dashboard yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {broadcastLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 text-sm">{log.subject}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {log.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-slate-500 text-[11px]">
                    <span>From: <strong>{log.from}</strong></span>
                    <span>Target: <strong>{log.targetType}</strong> {log.targetFilter ? `(${log.targetFilter})` : ""}</span>
                    <span>Sent Count: <strong className="text-emerald-700 font-black">{log.sentCount}</strong></span>
                    <span>Date: {new Date(log.timestamp).toLocaleString("en-ZA")}</span>
                  </div>

                  {Array.isArray(log.sampleRecipients) && log.sampleRecipients.length > 0 && (
                    <div className="pt-1 text-[11px] text-slate-400">
                      Sample Recipients: {log.sampleRecipients.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: VIEW ALL BUSINESS DETAILS */}
      {activeBusinessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                  Full Business Profile Record
                </span>
                <h3 className="text-xl font-black text-slate-900 font-display">
                  {activeBusinessModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveBusinessModal(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of All Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category &amp; Code</span>
                <span className="font-bold text-slate-800">{activeBusinessModal.category || "General"}</span>
                {activeBusinessModal.categoryCode && (
                  <span className="text-slate-500 font-mono block mt-0.5">Code: {activeBusinessModal.categoryCode}</span>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Province &amp; Postal Area</span>
                <span className="font-bold text-slate-800 capitalize">{activeBusinessModal.province || "Gauteng"}</span>
                <span className="text-slate-500 block mt-0.5">
                  Postal Code: {activeBusinessModal.postalCode || getPostalCodeForTown(activeBusinessModal.city || activeBusinessModal.town || "") || "Unspecified"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">City / Town &amp; Suburb</span>
                <span className="font-bold text-slate-800">{activeBusinessModal.city || activeBusinessModal.town || "Johannesburg"}</span>
                {activeBusinessModal.suburb && (
                  <span className="text-slate-500 block mt-0.5">Suburb: {activeBusinessModal.suburb}</span>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Physical / Operating Address</span>
                <span className="font-bold text-slate-800">{activeBusinessModal.address || "South Africa"}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Primary Telephone / WhatsApp</span>
                <span className="font-bold text-slate-800">
                  {activeBusinessModal.phone || activeBusinessModal.telephone || activeBusinessModal.whatsapp || "No phone listed"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registered Email</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {activeBusinessModal.email || "No email listed"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Official Website</span>
                <span className="font-bold text-slate-800 truncate block">
                  {activeBusinessModal.website || "No website listed"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Trading Hours</span>
                <span className="font-bold text-slate-800">{activeBusinessModal.tradingHours || "Standard Operating Hours"}</span>
              </div>
            </div>

            {/* Description & Services */}
            <div className="space-y-3 text-xs">
              {activeBusinessModal.servicesOffered && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Services Offered</span>
                  <p className="text-slate-700 leading-relaxed">{activeBusinessModal.servicesOffered}</p>
                </div>
              )}

              {activeBusinessModal.description && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Company Description</span>
                  <p className="text-slate-700 leading-relaxed">{activeBusinessModal.description}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 font-mono">ID: {activeBusinessModal.id}</span>

              <div className="flex items-center gap-2">
                {activeBusinessModal.email && activeBusinessModal.email.includes("@") && (
                  <button
                    type="button"
                    onClick={() => {
                      handleTargetSingleBusiness(activeBusinessModal);
                      setActiveBusinessModal(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Email This Business</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveBusinessModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
