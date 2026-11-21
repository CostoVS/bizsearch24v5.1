"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Copy, ArrowLeft, ShieldCheck } from "lucide-react";

function CopyCodeContent() {
  const searchParams = useSearchParams();
  const rawCode = searchParams.get("code") || "";
  const code = rawCode.replace(/\D/g, "").slice(0, 8);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      try {
        const input = document.createElement("input");
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };

  useEffect(() => {
    if (!code) return;
    handleCopy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-[#052e22] px-6 py-5 text-white">
          <div className="inline-flex items-center gap-1.5 bg-[#064e3b] border border-emerald-700 text-emerald-300 text-[11px] font-bold px-3 py-1 rounded-full mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SearchBiz 2FA Security</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">
            Verification <span className="text-emerald-400">Code</span>
          </h1>
        </div>

        <div className="p-6 text-center space-y-5">
          {code ? (
            <>
              <div
                onClick={handleCopy}
                className="cursor-pointer bg-[#052e22] border-2 border-emerald-500 rounded-xl py-4 px-5 select-all"
              >
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1">
                  Tap to Copy 6-Digit Code
                </div>
                <div className="text-3xl font-mono font-extrabold tracking-[0.22em] text-white whitespace-nowrap">
                  {code}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3 px-4 rounded-xl transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied {code} to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Code ({code})</span>
                  </>
                )}
              </button>

              <p className="text-xs text-slate-500">
                Switch back to your SearchBiz tab and paste the code into the verification box.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600">No verification code was provided in this link.</p>
          )}

          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to SearchBiz Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CopyCodePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-sm text-slate-500">
          Loading code...
        </div>
      }
    >
      <CopyCodeContent />
    </Suspense>
  );
}
