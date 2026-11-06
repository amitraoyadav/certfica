import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  KeyRound,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  FilePlus,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { PScrapLogo } from './PScrapLogo';

interface FrontPageLoginProps {
  onLoginSuccess: (token: string, username: string) => void;
  onGoToVerify: () => void;
}

export const FrontPageLogin: React.FC<FrontPageLoginProps> = ({
  onLoginSuccess,
  onGoToVerify,
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Clear any previously cached password from localStorage for security
    localStorage.removeItem('ps_saved_password');

    const savedUser = localStorage.getItem('ps_saved_username') || '';
    const rememberPref = localStorage.getItem('ps_remember_me') !== 'false';

    if (savedUser) {
      setUsername(savedUser);
    }
    setRememberMe(rememberPref);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setErrorMessage('Incorrect Information. Please enter both username and password.');
      return;
    }

    setIsLoading(true);

    try {
      let data: any = null;
      let isOk = false;
      let statusCode = 0;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: cleanUsername, password: cleanPassword }),
        });
        isOk = res.ok;
        statusCode = res.status;
        const text = await res.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }
        }
      } catch {
        isOk = false;
        data = null;
      }

      if (isOk && data?.success && data?.token) {
        if (rememberMe) {
          localStorage.setItem('ps_saved_username', cleanUsername);
          localStorage.setItem('ps_remember_me', 'true');
        } else {
          localStorage.removeItem('ps_saved_username');
          localStorage.setItem('ps_remember_me', 'false');
        }
        localStorage.removeItem('ps_saved_password');
        onLoginSuccess(data.token, data.user?.username || cleanUsername);
        return;
      }

      if (statusCode === 401 || statusCode === 400) {
        setErrorMessage(
          data?.message || 'Incorrect Information. Please check your username and password.'
        );
      } else {
        setErrorMessage(
          data?.message && !data.message.includes('Unexpected') && !data.message.includes('JSON')
            ? data.message
            : 'Incorrect Information. Please check your username and password.'
        );
      }
    } catch {
      setErrorMessage('Incorrect Information. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto py-4 sm:py-8 px-2 sm:px-0">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center mb-3">
          <PScrapLogo size="lg" variant="dark" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black font-serif text-[#0d2847] tracking-tight">
          PARIVAHAN SCRAPPERS
        </h1>
        <p className="text-xs sm:text-sm text-emerald-700 font-semibold mt-1">
          Vehicle Scrapping Certificate Management System
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Authorized Digital Certificate Issuance &amp; Verification Portal
        </p>
      </div>

      {/* Main Login Card - Highly Mobile-Optimized */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Top Banner */}
        <div className="bg-[#0d2847] px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-emerald-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-none">
                Admin Sign In
              </h2>
              <span className="text-[11px] text-slate-300">
                Sign in to create &amp; issue certificates
              </span>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Authorized Only</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-7 space-y-5">
          {/* Security Notice: Fixed Credentials */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <ShieldAlert className="w-4 h-4 text-[#0d2847] shrink-0" />
              <span>Restricted administrator access. Authorized personnel only.</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
              Secure
            </span>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="front-login-username"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Admin Username
              </label>
              <div className="relative">
                <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="front-login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter administrator username (e.g. pscrappers)"
                  required
                  className="w-full pl-11 pr-4 py-3 text-base sm:text-sm font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none bg-slate-50/50 min-h-[48px]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="front-login-password"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Admin Password
              </label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="front-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  required
                  className="w-full pl-11 pr-12 py-3 text-base sm:text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none bg-slate-50/50 min-h-[48px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1.5 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Username Checkbox */}
            <div className="pt-1">
              <label
                htmlFor="front-checkbox-remember"
                className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-slate-700 font-medium py-1"
              >
                <input
                  id="front-checkbox-remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 rounded text-[#0d2847] focus:ring-[#0d2847] border-slate-300 cursor-pointer accent-[#0d2847]"
                />
                <span>Remember my username on this device</span>
              </label>
            </div>

            {/* Primary Action Button: Sign In & Direct Make Certificate */}
            <button
              id="btn-front-signin-create"
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-6 text-sm font-bold text-white bg-[#0d2847] hover:bg-[#163a63] active:bg-[#091b30] rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[48px]"
            >
              {isLoading ? (
                'Authenticating...'
              ) : (
                <>
                  <FilePlus className="w-5 h-5 text-emerald-400" />
                  <span>Sign In &amp; Make New Certificate</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>

          {/* Customer Verification Link */}
          <div className="pt-4 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500 mb-2">
              Are you a customer or vehicle owner looking to verify a certificate?
            </p>
            <button
              id="btn-switch-to-verify"
              type="button"
              onClick={onGoToVerify}
              className="w-full py-3 px-4 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Go to Public Certificate Verification &amp; Download</span>
            </button>
          </div>
        </div>
      </div>

      {/* Trust & Support Info */}
      <div className="mt-6 text-center text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">
          PARIVAHAN SCRAPPERS • A Unit OF Scrapping Yard Ltd.
        </p>
        <p>B12, Dwarka, New Delhi.</p>
      </div>
    </div>
  );
};
