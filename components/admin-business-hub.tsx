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
  Copy,
  SlidersHorizontal,
  CheckSquare,
  Square,
  Users,
  UserCheck,
  Download
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
  adminApproved?: boolean;
  verified?: boolean;
  isVerified?: boolean;
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

  // Server-loaded full dataset
  const [serverBusinesses, setServerBusinesses] = useState<BusinessRecord[]>(ads);
  const [isLoadingAllBusinesses, setIsLoadingAllBusinesses] = useState(false);

  // Filter States for Directory
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSuburb, setSelectedSuburb] = useState("all");
  const [filterHasEmailOnly, setFilterHasEmailOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "category" | "province" | "postal" | "email_first">("name_asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "unverified">("all");

  // Selection states for selective emailing
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<Set<string>>(new Set());
  const [excludedRecipientEmails, setExcludedRecipientEmails] = useState<Set<string>>(new Set());
  const [recipientSearchQuery, setRecipientSearchQuery] = useState("");

  // Column / Detail Visibility Selector state
  const [visibleColumns, setVisibleColumns] = useState({
    address: true,
    email: true,
    website: true,
    whatsapp: true,
    phone: true,
    telephone: true,
    suburbPostal: true,
    services: true,
    hours: false,
    description: false
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // Selected Business for Detail Modal
  const [activeBusinessModal, setActiveBusinessModal] = useState<BusinessRecord | null>(null);

  // Email Composer States
  const [emailTargetType, setEmailTargetType] = useState<"selected" | "all" | "province" | "category" | "single">("all");
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
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Export full extracted businesses to CSV
  const handleExportCsv = (list: BusinessRecord[], filename = "SearchBiz_Extracted_Businesses.csv") => {
    if (!list || list.length === 0) {
      alert("No businesses available to export.");
      return;
    }
    const headers = [
      "Company Name",
      "Email Address",
      "Phone Number",
      "Telephone",
      "WhatsApp",
      "Physical Street Address",
      "Suburb",
      "City/Town",
      "Postal Code",
      "Province",
      "Category",
      "Category Code",
      "Website",
      "Trading Hours",
      "Services Offered",
      "Description"
    ];
    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };
    const rows = list.map(b => [
      escapeCsv(b.title || ""),
      escapeCsv(b.email || ""),
      escapeCsv(b.phone || ""),
      escapeCsv(b.telephone || ""),
      escapeCsv(b.whatsapp || ""),
      escapeCsv(b.address || ""),
      escapeCsv(b.suburb || ""),
      escapeCsv(b.city || b.town || ""),
      escapeCsv(b.postalCode || getPostalCodeForTown(b.city || b.town || "") || ""),
      escapeCsv(b.province || ""),
      escapeCsv(b.category || ""),
      escapeCsv(b.categoryCode || ""),
      escapeCsv(b.website || ""),
      escapeCsv(b.tradingHours || ""),
      escapeCsv(b.servicesOffered || ""),
      escapeCsv(b.description || "")
    ].join(","));

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy all unique valid emails to clipboard formatted for email clients
  const handleCopyEmails = (list: BusinessRecord[]) => {
    const emails = Array.from(
      new Set(
        list
          .map(b => (b.email || "").trim())
          .filter(e => e && e.includes("@"))
      )
    );
    if (emails.length === 0) {
      alert("No email addresses found in these listings.");
      return;
    }
    const text = emails.join(", ");
    navigator.clipboard.writeText(text);
    setCopiedToast(`Copied ${emails.length.toLocaleString()} email addresses to clipboard!`);
    setTimeout(() => setCopiedToast(null), 4000);
  };

  // Load complete businesses database with all CSV details without 50-limit
  const loadAllServerBusinesses = async () => {
    setIsLoadingAllBusinesses(true);
    try {
      const res = await fetch("/api/storage?includeInactive=true&hubOnly=true&noLimit=true", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.ads) && data.ads.length > 0) {
          setServerBusinesses(data.ads);
        }
      }
    } catch (e) {
      console.error("Failed to load all businesses for business hub:", e);
    } finally {
      setIsLoadingAllBusinesses(false);
    }
  };

  useEffect(() => {
    loadAllServerBusinesses();
  }, []);

  useEffect(() => {
    if (ads && ads.length > 0 && serverBusinesses.length === 0) {
      setServerBusinesses(ads);
    }
  }, [ads, serverBusinesses.length]);

  const baseBusinesses = useMemo(() => {
    return serverBusinesses.length > 0 ? serverBusinesses : (ads || []);
  }, [serverBusinesses, ads]);

  // Extract all unique Suburbs and Towns for the selected province
  const availableSuburbs = useMemo(() => {
    const set = new Set<string>();
    for (const b of baseBusinesses) {
      if (selectedProvince !== "all" && (b.province || "").toLowerCase() !== selectedProvince.toLowerCase()) {
        continue;
      }
      if (b.suburb && b.suburb.trim()) set.add(b.suburb.trim());
      else if (b.city && b.city.trim()) set.add(b.city.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseBusinesses, selectedProvince]);

  const handleTestSmtp = async () => {
    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "mailsearchbiz@gmail.com" })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpTestResult({
          success: true,
          message: data.message || "Test email dispatched successfully! SMTP connection verified."
        });
      } else {
        setSmtpTestResult({
          success: false,
          message: data.error || data.message || "SMTP test failed."
        });
      }
    } catch (err: any) {
      setSmtpTestResult({
        success: false,
        message: err.message || "Failed to reach test email API."
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

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

  // Filtered & Sorted Businesses List
  const filteredBusinesses = useMemo(() => {
    let result = baseBusinesses;

    if (filterHasEmailOnly) {
      result = result.filter(b => b.email && b.email.includes("@"));
    }
    if (verificationFilter === "verified") {
      result = result.filter(b => b.verified === true || b.isVerified === true);
    } else if (verificationFilter === "unverified") {
      result = result.filter(b => !(b.verified === true || b.isVerified === true));
    }

    if (selectedProvince !== "all") {
      result = result.filter(b => (b.province || "").toLowerCase() === selectedProvince.toLowerCase());
    }

    if (selectedCategory !== "all") {
      result = result.filter(b => (b.category || "").toLowerCase() === selectedCategory.toLowerCase());
    }

    if (selectedSuburb !== "all") {
      const sLower = selectedSuburb.toLowerCase().trim();
      result = result.filter(b =>
        (b.suburb || "").toLowerCase().trim() === sLower ||
        (b.city || "").toLowerCase().trim() === sLower ||
        (b.town || "").toLowerCase().trim() === sLower ||
        (b.address || "").toLowerCase().includes(sLower)
      );
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(b =>
        (b.title || "").toLowerCase().includes(term) ||
        (b.email || "").toLowerCase().includes(term) ||
        (b.phone || "").toLowerCase().includes(term) ||
        (b.telephone || "").toLowerCase().includes(term) ||
        (b.whatsapp || "").toLowerCase().includes(term) ||
        (b.city || "").toLowerCase().includes(term) ||
        (b.suburb || "").toLowerCase().includes(term) ||
        (b.postalCode || "").toLowerCase().includes(term) ||
        (b.address || "").toLowerCase().includes(term) ||
        (b.category || "").toLowerCase().includes(term) ||
        (b.servicesOffered || "").toLowerCase().includes(term)
      );
    }

    // Sorting
    result = [...result].sort((a, b) => {
      if (sortBy === "name_asc") {
        return (a.title || "").localeCompare(b.title || "");
      }
      if (sortBy === "name_desc") {
        return (b.title || "").localeCompare(a.title || "");
      }
      if (sortBy === "category") {
        return (a.category || "").localeCompare(b.category || "");
      }
      if (sortBy === "province") {
        return (a.province || "").localeCompare(b.province || "");
      }
      if (sortBy === "postal") {
        return (a.postalCode || "").localeCompare(b.postalCode || "");
      }
      if (sortBy === "email_first") {
        const aHas = Boolean(a.email && a.email.includes("@"));
        const bHas = Boolean(b.email && b.email.includes("@"));
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return (a.title || "").localeCompare(b.title || "");
      }
      return 0;
    });

    return result;
  }, [baseBusinesses, searchTerm, selectedProvince, selectedCategory, selectedSuburb, filterHasEmailOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBusinesses.length / itemsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedBusinesses = filteredBusinesses.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  // Recipient Target List Calculation for Email Broadcaster
  const rawCandidateRecipients = useMemo(() => {
    const listWithEmail = baseBusinesses.filter(b => b.email && b.email.includes("@"));

    if (emailTargetType === "selected") {
      if (selectedBusinessIds.size === 0) return listWithEmail;
      return listWithEmail.filter(b => selectedBusinessIds.has(b.id));
    }
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
  }, [baseBusinesses, emailTargetType, selectedBusinessIds, emailTargetProvince, emailTargetCategory, emailSingleTarget, manualSingleEmail, manualSingleName]);

  // Excluded recipients can be unchecked by user!
  const finalActiveRecipients = useMemo(() => {
    return rawCandidateRecipients.filter(b => !excludedRecipientEmails.has((b.email || "").toLowerCase().trim()));
  }, [rawCandidateRecipients, excludedRecipientEmails]);

  // Filtered recipient list for display in the selection hub
  const displayedCandidateRecipients = useMemo(() => {
    if (!recipientSearchQuery.trim()) return rawCandidateRecipients;
    const q = recipientSearchQuery.toLowerCase().trim();
    return rawCandidateRecipients.filter(b =>
      (b.title || "").toLowerCase().includes(q) ||
      (b.email || "").toLowerCase().includes(q) ||
      (b.city || "").toLowerCase().includes(q) ||
      (b.suburb || "").toLowerCase().includes(q)
    );
  }, [rawCandidateRecipients, recipientSearchQuery]);

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

  // Switch to email tab targeting selected businesses
  const handleTargetSelectedBusinesses = () => {
    setEmailTargetType("selected");
    setExcludedRecipientEmails(new Set());
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

    if (!isTest && finalActiveRecipients.length === 0) {
      alert("There are no active recipient email addresses selected. Please check at least 1 recipient.");
      return;
    }

    const confirmMsg = isTest
      ? `Send test preview email to ${SENDER_EMAIL}?`
      : `Are you sure you want to send this email to ${finalActiveRecipients.length.toLocaleString()} business(es) from ${SENDER_EMAIL}?`;

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
            : emailTargetType === "selected"
            ? `Selected Businesses (${finalActiveRecipients.length})`
            : "All Businesses",
        subject: emailSubject,
        messageBody: emailBody,
        recipients: finalActiveRecipients.map(b => ({
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

  const totalIndexed = baseBusinesses.length;
  const totalWithEmail = baseBusinesses.filter(b => b.email && b.email.includes("@")).length;
  const totalVerified = baseBusinesses.filter(b => b.verified === true || b.isVerified === true).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* Top Banner Card */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-emerald-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <Building2 className="w-3.5 h-3.5" />
              <span>South African Business Intelligence &amp; Direct Messaging Hub</span>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isTestingSmtp}
                onClick={handleTestSmtp}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition border border-emerald-500/40 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{isTestingSmtp ? "Testing SMTP..." : "Test SMTP Live"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  loadAllServerBusinesses();
                  if (onRefreshAds) onRefreshAds();
                }}
                disabled={isLoadingAllBusinesses}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 transition border border-white/10 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAllBusinesses ? "animate-spin" : ""}`} />
                <span>{isLoadingAllBusinesses ? "Refreshing..." : "Refresh Data"}</span>
              </button>
            </div>
            <div className="px-4 py-2 rounded-xl bg-emerald-900/60 border border-emerald-600/30 text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Official Sender: {SENDER_EMAIL}</span>
            </div>
          </div>
        </div>

        {/* Live SMTP Test Alert Banner */}
        {smtpTestResult && (
          <div className={`mt-5 p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-3 ${
            smtpTestResult.success 
              ? "bg-emerald-900/90 border-emerald-500 text-emerald-100" 
              : "bg-rose-950/90 border-rose-500 text-rose-100"
          }`}>
            <div className="flex items-center gap-2">
              {smtpTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              <span>{smtpTestResult.message}</span>
            </div>
            <button 
              type="button"
              onClick={() => setSmtpTestResult(null)}
              className="text-[10px] uppercase font-bold underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

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
            <span className="text-blue-400 block text-[10px] font-bold uppercase tracking-wider">Verified Businesses</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="lg:col-span-2 relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search name, email, phone, suburb, town, postal code..."
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
                    setSelectedSuburb("all");
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="all">All 9 Provinces (SA)</option>
                  {SA_PROVINCES.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Suburb / Town Selector */}
              <div>
                <select
                  value={selectedSuburb}
                  onChange={(e) => {
                    setSelectedSuburb(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="all">All Suburbs &amp; Towns ({availableSuburbs.length})</option>
                  {availableSuburbs.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
                  <option value="all">All Categories ({CATEGORIES.length})</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Verification Filter */}
              <div>
                <select
                  value={verificationFilter}
                  onChange={(e) => {
                    setVerificationFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="all">All Verification Status</option>
                  <option value="verified">Verified Only</option>
                  <option value="unverified">Unverified Only</option>
                </select>
              </div>
              {/* Sort By */}
              <div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition cursor-pointer"
                >
                  <option value="name_asc">Sort: Name (A-Z)</option>
                  <option value="name_desc">Sort: Name (Z-A)</option>
                  <option value="category">Sort: Category</option>
                  <option value="province">Sort: Province</option>
                  <option value="postal">Sort: Postal Code</option>
                  <option value="email_first">Sort: Email First</option>
                </select>
              </div>
            </div>

            {/* Sub-Filters, Column Toggles & Stats */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-4">
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
                    <span>Show only businesses with valid email</span>
                  </span>
                </label>

                {/* Column Customizer Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Choose Columns to View</span>
                </button>

                {/* Force Reload Full Database Button */}
                <button
                  type="button"
                  disabled={isLoadingAllBusinesses}
                  onClick={loadAllServerBusinesses}
                  className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Reload all businesses from server database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isLoadingAllBusinesses ? "animate-spin" : ""}`} />
                  <span>{isLoadingAllBusinesses ? "Loading..." : `Reload All DB (${baseBusinesses.length.toLocaleString()})`}</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-medium">
                  Showing <strong className="text-slate-900">{filteredBusinesses.length.toLocaleString()}</strong> businesses
                </span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={500}>500 per page</option>
                  <option value={1000}>1000 per page</option>
                  <option value={5000}>5000 per page</option>
                  <option value={10000}>10000 per page</option>
                  <option value={999999}>All rows ({filteredBusinesses.length.toLocaleString()})</option>
                </select>
              </div>
            </div>

            {/* Batch Selection Action Deck */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs bg-slate-50/70 p-3 rounded-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">Select to Email:</span>
                
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedBusinessIds);
                    paginatedBusinesses.forEach(b => next.add(b.id));
                    setSelectedBusinessIds(next);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Select Page ({paginatedBusinesses.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedBusinessIds);
                    filteredBusinesses.forEach(b => next.add(b.id));
                    setSelectedBusinessIds(next);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Select Filtered ({filteredBusinesses.length.toLocaleString()})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedBusinessIds);
                    filteredBusinesses.filter(b => b.email && b.email.includes("@")).forEach(b => next.add(b.id));
                    setSelectedBusinessIds(next);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-bold text-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Select with Email ({filteredBusinesses.filter(b => b.email && b.email.includes("@")).length.toLocaleString()})</span>
                </button>

                {selectedBusinessIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedBusinessIds(new Set())}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 text-rose-700 font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Selection</span>
                  </button>
                )}

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => handleCopyEmails(selectedBusinessIds.size > 0 ? filteredBusinesses.filter(b => selectedBusinessIds.has(b.id)) : filteredBusinesses)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Copy email addresses to clipboard"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copy Emails {selectedBusinessIds.size > 0 ? `(${selectedBusinessIds.size})` : `(${filteredBusinesses.filter(b => b.email && b.email.includes("@")).length})`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCsv(selectedBusinessIds.size > 0 ? filteredBusinesses.filter(b => selectedBusinessIds.has(b.id)) : filteredBusinesses)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Export extracted directory listings to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Export CSV</span>
                </button>
              </div>

              {selectedBusinessIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-900 bg-emerald-100/70 px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5 text-xs">
                    <UserCheck className="w-4 h-4 text-emerald-700" />
                    <span>{selectedBusinessIds.size.toLocaleString()} selected</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleTargetSelectedBusinesses}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer text-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Compose Email to Selected ({selectedBusinessIds.size.toLocaleString()})</span>
                  </button>
                </div>
              )}
            </div>

            {/* Column Selector Drawer / Panel */}
            {showColumnSelector && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">Choose which business details to display:</span>
                  <button
                    onClick={() => setShowColumnSelector(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs font-medium text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.address}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, address: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Street Address</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.email}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, email: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Email Address</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.website}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, website: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Website URL</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.whatsapp}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, whatsapp: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>WhatsApp</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.phone}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, phone: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Phone Number</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.telephone}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, telephone: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Telephone Number</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.suburbPostal}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, suburbPostal: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Suburb &amp; Postal Code</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.services}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, services: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Services Offered</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.hours}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, hours: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Trading Hours</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.description}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, description: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 w-4 h-4"
                    />
                    <span>Description</span>
                  </label>
                </div>
              </div>
            )}
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
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={paginatedBusinesses.length > 0 && paginatedBusinesses.every(b => selectedBusinessIds.has(b.id))}
                          onChange={(e) => {
                            const next = new Set(selectedBusinessIds);
                            if (e.target.checked) {
                              paginatedBusinesses.forEach(b => next.add(b.id));
                            } else {
                              paginatedBusinesses.forEach(b => next.delete(b.id));
                            }
                            setSelectedBusinessIds(next);
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                          title="Select / Unselect all on this page"
                        />
                      </th>
                      <th className="py-3 px-4">Business &amp; Category</th>
                      <th className="py-3 px-4">Location &amp; Province</th>
                      {visibleColumns.address && <th className="py-3 px-4 min-w-[180px]">Physical Address</th>}
                      {visibleColumns.suburbPostal && <th className="py-3 px-4">Suburb &amp; Postal</th>}
                      {visibleColumns.phone && <th className="py-3 px-4">Phone</th>}
                      {visibleColumns.telephone && <th className="py-3 px-4">Telephone</th>}
                      {visibleColumns.whatsapp && <th className="py-3 px-4">WhatsApp</th>}
                      {visibleColumns.email && <th className="py-3 px-4">Email</th>}
                      {visibleColumns.website && <th className="py-3 px-4">Website</th>}
                      {visibleColumns.services && <th className="py-3 px-4">Services</th>}
                      {visibleColumns.hours && <th className="py-3 px-4">Trading Hours</th>}
                      {visibleColumns.description && <th className="py-3 px-4">Description</th>}
                      <th className="py-3 px-4 text-right sticky right-0 bg-slate-50 shadow-xs z-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {paginatedBusinesses.map((b) => {
                      const postal = b.postalCode || getPostalCodeForTown(b.city || b.town || "");
                      const hasEmail = Boolean(b.email && b.email.includes("@"));
                      const isSelected = selectedBusinessIds.has(b.id);

                      return (
                        <tr key={b.id || Math.random().toString()} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-emerald-50/30" : ""}`}>
                          {/* Row Checkbox */}
                          <td className="py-3.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedBusinessIds);
                                if (next.has(b.id)) next.delete(b.id);
                                else next.add(b.id);
                                setSelectedBusinessIds(next);
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              title="Select this business"
                            />
                          </td>
                          {/* Business & Category */}
                          <td className="py-3.5 px-4 min-w-[200px]">
                            <div className="font-bold text-slate-900 text-sm flex flex-wrap items-center gap-1.5">
                              <span>{b.title || "Unnamed Business"}</span>
                              {b.verified ? (
                                <span title="Verified Business" className="inline-flex items-center text-[10px] font-black uppercase text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 shadow-2xs">
                                  <CheckCircle2 className="w-3 h-3 mr-0.5 text-emerald-600 shrink-0" />
                                  Verified
                                </span>
                              ) : (
                                <span title="Unverified Listing" className="inline-flex items-center text-[10px] font-bold uppercase text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-300 shadow-2xs">
                                  <AlertCircle className="w-3 h-3 mr-0.5 text-rose-600 shrink-0" />
                                  Unverified
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

                          {/* Location & Province */}
                          <td className="py-3.5 px-4 min-w-[150px]">
                            <div className="flex items-center gap-1 text-slate-800 font-semibold">
                              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">{b.city || b.town || "Johannesburg"}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 capitalize mt-0.5">
                              {b.province || "Gauteng"}
                            </div>
                          </td>

                          {/* Physical Address */}
                          {visibleColumns.address && (
                            <td className="py-3.5 px-4 min-w-[180px]">
                              {b.address ? (
                                <div className="text-slate-800 text-[11px] leading-snug line-clamp-2" title={b.address}>
                                  {b.address}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px] italic">Not specified</span>
                              )}
                            </td>
                          )}

                          {/* Suburb & Postal */}
                          {visibleColumns.suburbPostal && (
                            <td className="py-3.5 px-4 min-w-[140px]">
                              <div className="text-slate-800 font-semibold truncate">{b.suburb || "Central"}</div>
                              {postal && (
                                <span className="font-mono font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px] inline-block mt-0.5">
                                  {postal}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Phone */}
                          {visibleColumns.phone && (
                            <td className="py-3.5 px-4 min-w-[130px]">
                              {b.phone ? (
                                <div className="flex items-center gap-1 text-slate-800 font-mono text-[11px]">
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{b.phone}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px]">-</span>
                              )}
                            </td>
                          )}

                          {/* Telephone */}
                          {visibleColumns.telephone && (
                            <td className="py-3.5 px-4 min-w-[130px]">
                              {b.telephone ? (
                                <div className="flex items-center gap-1 text-slate-800 font-mono text-[11px]">
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{b.telephone}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px]">-</span>
                              )}
                            </td>
                          )}

                          {/* WhatsApp */}
                          {visibleColumns.whatsapp && (
                            <td className="py-3.5 px-4 min-w-[130px]">
                              {b.whatsapp ? (
                                <div className="flex items-center gap-1 text-emerald-800 font-mono text-[11px]">
                                  <MessageSquare className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{b.whatsapp}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px]">-</span>
                              )}
                            </td>
                          )}

                          {/* Email */}
                          {visibleColumns.email && (
                            <td className="py-3.5 px-4 min-w-[180px]">
                              {hasEmail ? (
                                <div className="flex items-center gap-1.5">
                                  <a
                                    href={`mailto:${b.email}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 transition"
                                    title="Open in email client"
                                  >
                                    <Mail className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span className="truncate max-w-[120px]">{b.email}</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(b.email || "");
                                      setCopiedToast(`Copied ${b.email} to clipboard!`);
                                      setTimeout(() => setCopiedToast(null), 3000);
                                    }}
                                    className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-slate-100 transition cursor-pointer"
                                    title="Copy email address"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">No email</span>
                              )}
                            </td>
                          )}

                          {/* Website */}
                          {visibleColumns.website && (
                            <td className="py-3.5 px-4 min-w-[140px]">
                              {b.website ? (
                                <div className="flex items-center gap-1 text-emerald-700 truncate max-w-[130px]">
                                  <Globe className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span className="truncate">{b.website.replace(/^https?:\/\//, "")}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[10px]">-</span>
                              )}
                            </td>
                          )}

                          {/* Services */}
                          {visibleColumns.services && (
                            <td className="py-3.5 px-4 min-w-[150px]">
                              <span className="text-slate-600 line-clamp-1 max-w-[150px]">
                                {b.servicesOffered || b.category}
                              </span>
                            </td>
                          )}

                          {/* Trading Hours */}
                          {visibleColumns.hours && (
                            <td className="py-3.5 px-4 min-w-[130px]">
                              <span className="text-slate-600 text-[11px]">
                                {b.tradingHours || "Standard Hours"}
                              </span>
                            </td>
                          )}

                          {/* Description */}
                          {visibleColumns.description && (
                            <td className="py-3.5 px-4 min-w-[180px]">
                              <span className="text-slate-600 line-clamp-1 italic max-w-[180px]">
                                {b.description || "No description"}
                              </span>
                            </td>
                          )}

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right min-w-[170px] sticky right-0 bg-white shadow-xs z-20">
                            <div className="flex items-center justify-end gap-1.5">
                              {hasEmail && (
                                <button
                                  type="button"
                                  onClick={() => handleTargetSingleBusiness(b)}
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs cursor-pointer"
                                  title="Send direct email via Business Hub"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Hub Email</span>
                                </button>
                              )}

                              {hasEmail && (
                                <a
                                  href={`mailto:${b.email}`}
                                  className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                                  title="Open in your email client (Gmail, Outlook, etc.)"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => setActiveBusinessModal(b)}
                                className="px-2 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
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
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-800 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-800 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EMAIL BROADCASTER HUB */}
      {activeSubTab === "email" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Target & Template Setup */}
          <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 text-base font-display flex items-center gap-2">
                <SendHorizontal className="w-5 h-5 text-emerald-600" />
                <span>Target Audience &amp; Category</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Choose who receives this email broadcast based on region, category, or single contact.
              </p>
            </div>

            {/* Target Type Selector */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Target Group</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEmailTargetType("all")}
                  className={`p-3 rounded-2xl border text-xs font-bold transition text-left cursor-pointer ${
                    emailTargetType === "all"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-black">All Businesses</span>
                  <span className="text-[10px] text-slate-500 font-normal">All with valid email</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEmailTargetType("province")}
                  className={`p-3 rounded-2xl border text-xs font-bold transition text-left cursor-pointer ${
                    emailTargetType === "province"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-black">By Province</span>
                  <span className="text-[10px] text-slate-500 font-normal">Target specific region</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEmailTargetType("category")}
                  className={`p-3 rounded-2xl border text-xs font-bold transition text-left cursor-pointer ${
                    emailTargetType === "category"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-black">By Category</span>
                  <span className="text-[10px] text-slate-500 font-normal">Target trade sector</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEmailTargetType("single")}
                  className={`p-3 rounded-2xl border text-xs font-bold transition text-left cursor-pointer ${
                    emailTargetType === "single"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block font-black">Single Business</span>
                  <span className="text-[10px] text-slate-500 font-normal">Individual contact</span>
                </button>
              </div>

              {/* Conditional Province Selector */}
              {emailTargetType === "province" && (
                <div className="pt-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Select Target Province</label>
                  <select
                    value={emailTargetProvince}
                    onChange={(e) => setEmailTargetProvince(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    {SA_PROVINCES.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional Category Selector */}
              {emailTargetType === "category" && (
                <div className="pt-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Select Target Category</label>
                  <select
                    value={emailTargetCategory}
                    onChange={(e) => setEmailTargetCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional Single Target Details */}
              {emailTargetType === "single" && (
                <div className="pt-2 space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500 block">Single Recipient</label>
                  {emailSingleTarget ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-emerald-950 text-xs">{emailSingleTarget.title}</p>
                        <p className="text-[11px] text-emerald-700 font-mono">{emailSingleTarget.email}</p>
                      </div>
                      <button
                        onClick={() => setEmailSingleTarget(null)}
                        className="text-xs text-emerald-800 underline font-bold"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Business Name"
                        value={manualSingleName}
                        onChange={(e) => setManualSingleName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                      />
                      <input
                        type="email"
                        placeholder="business@email.co.za"
                        value={manualSingleEmail}
                        onChange={(e) => setManualSingleEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Target Recipient Count Badge */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex items-center justify-between font-bold">
                <span className="text-slate-600">Matched Email Recipients:</span>
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                  {finalActiveRecipients.length.toLocaleString()} business(es)
                </span>
              </div>

              {/* Interactive Extracted Recipient Directory & Details View */}
              <div className="pt-2 space-y-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    Extracted Email Recipients ({finalActiveRecipients.length.toLocaleString()})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyEmails(finalActiveRecipients)}
                      className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 transition"
                      title="Copy all recipient email addresses to clipboard"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy All</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportCsv(finalActiveRecipients, "SearchBiz_Email_Recipients.csv")}
                      className="text-[10px] text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer bg-slate-100 px-2 py-0.5 rounded border border-slate-200 transition"
                      title="Download recipient list as CSV"
                    >
                      <Download className="w-3 h-3" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                {/* Search input for recipients */}
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={recipientSearchQuery}
                    onChange={(e) => setRecipientSearchQuery(e.target.value)}
                    placeholder="Filter extracted recipients..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-3 py-1.5 text-[11px] text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Recipient list container */}
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
                  {displayedCandidateRecipients.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-4 italic">No matching email recipients found.</p>
                  ) : (
                    displayedCandidateRecipients.slice(0, 100).map((r) => {
                      const isExcluded = excludedRecipientEmails.has((r.email || "").toLowerCase().trim());
                      const pCode = r.postalCode || getPostalCodeForTown(r.city || r.town || "");
                      return (
                        <div key={r.id || r.email} className={`pt-2 pb-1.5 flex items-start justify-between gap-2 text-[11px] ${isExcluded ? "opacity-50" : ""}`}>
                          <div className="flex items-start gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => {
                                const next = new Set(excludedRecipientEmails);
                                const em = (r.email || "").toLowerCase().trim();
                                if (isExcluded) next.delete(em);
                                else next.add(em);
                                setExcludedRecipientEmails(next);
                              }}
                              className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                              title={isExcluded ? "Include this business in broadcast" : "Exclude this business from broadcast"}
                            />
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-bold text-slate-900 truncate">{r.title}</p>
                              <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[10px]">
                                <span className="text-emerald-700 font-bold truncate max-w-[150px]">{r.email}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(r.email || "");
                                    setCopiedToast(`Copied ${r.email} to clipboard!`);
                                    setTimeout(() => setCopiedToast(null), 3000);
                                  }}
                                  className="text-slate-400 hover:text-emerald-700 cursor-pointer p-0.5"
                                  title="Copy email"
                                >
                                  <Copy className="w-2.5 h-2.5" />
                                </button>
                                <a
                                  href={`mailto:${r.email}`}
                                  className="text-slate-400 hover:text-emerald-700 p-0.5"
                                  title="Open in mail app"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                              <div className="text-[10px] text-slate-500 truncate flex flex-wrap items-center gap-1">
                                <span>{r.suburb || r.city || r.town}</span>
                                {pCode && <span className="font-mono bg-amber-50 text-amber-900 border border-amber-200/80 px-1 rounded text-[9px] font-bold">{pCode}</span>}
                                {r.phone && <span className="font-mono text-slate-600">&bull; {r.phone}</span>}
                                {r.address && <span className="text-slate-400 max-w-[120px] truncate">&bull; {r.address}</span>}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTargetSingleBusiness(r)}
                            className="shrink-0 px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
                            title="Set as single target"
                          >
                            Single
                          </button>
                        </div>
                      );
                    })
                  )}
                  {displayedCandidateRecipients.length > 100 && (
                    <p className="text-[10px] text-center text-slate-400 pt-1">
                      Showing first 100 of {displayedCandidateRecipients.length.toLocaleString()} matching businesses
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Preset Templates */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Preset Email Templates</label>
              <div className="space-y-2">
                {PRESET_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={`w-full text-left p-3 rounded-2xl border text-xs transition cursor-pointer ${
                      selectedTemplateId === tmpl.id
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
                    }`}
                  >
                    <span className="font-bold block">{tmpl.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Composer & Live Preview */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-slate-900 text-base font-display flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-600" />
                <span>Email Message Composer</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Customize subject and body. Use personalization tokens like <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-800 font-mono">&#123;business_name&#125;</code> and <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-800 font-mono">&#123;city&#125;</code>.
              </p>
            </div>

            {/* Personalization Tokens Bar */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-bold uppercase text-[10px] mr-1">Insert Token:</span>
              {["{business_name}", "{city}", "{suburb}", "{postal_code}", "{province}", "{category}", "{listing_url}"].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertToken(token)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 text-slate-700 font-mono font-bold border border-slate-200 transition cursor-pointer"
                >
                  {token}
                </button>
              ))}
            </div>

            {/* Subject Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Email Subject Line</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Enter email subject..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
            </div>

            {/* Body Textarea */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Email Message Body (Plain Text with Auto Line Breaks)</label>
              <textarea
                rows={12}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Compose your message..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition leading-relaxed resize-y"
              />
            </div>

            {/* Status Feedback */}
            {sendStatus && (
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                sendStatus.success ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
              }`}>
                {sendStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{sendStatus.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={isSending}
                onClick={() => handleSendBroadcast(true)}
                className="px-5 py-3 rounded-2xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-4 h-4 text-slate-500" />
                <span>Send Test Preview to Me</span>
              </button>

              <button
                type="button"
                disabled={isSending || finalActiveRecipients.length === 0}
                onClick={() => handleSendBroadcast(false)}
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
                        : `Dispatch to ${finalActiveRecipients.length.toLocaleString()} Businesses`}
                    </span>
                  </>
                )}
              </button>
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                <span className="font-bold text-slate-800 font-mono">
                  {activeBusinessModal.phone || "No phone listed"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Telephone Number</span>
                <span className="font-bold text-slate-800 font-mono">
                  {activeBusinessModal.telephone || "No telephone listed"}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">WhatsApp Number</span>
                <span className="font-bold text-emerald-800 font-mono">
                  {activeBusinessModal.whatsapp || "No whatsapp listed"}
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

      {/* Floating Copied Toast Alert */}
      {copiedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-200 border border-slate-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copiedToast}</span>
        </div>
      )}
    </div>
  );
}
