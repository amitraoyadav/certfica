import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  KeyRound,
  AlertTriangle,
  X,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string, username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const savedUser = localStorage.getItem('ps_saved_username') ?? 'pscrappers';
      const rememberPref = localStorage.getItem('ps_remember_me') !== 'false';

      // Always clear any previously cached password from storage
      localStorage.removeItem('ps_saved_password');

      setUsername(savedUser);
      setPassword('');
      setRememberMe(rememberPref);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

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

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: cleanUsername, password: cleanPassword }),
        });
        isOk = res.ok;
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
        onClose();
        return;
      }

      const failureMsg =
        data?.message && !data.message.includes('Unexpected') && !data.message.includes('JSON')
          ? data.message
          : 'Incorrect Information. Please check your credentials.';
      setErrorMessage(failureMsg);
    } catch {
      setErrorMessage('Incorrect Information. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0d2847] text-white flex items-center justify-center shadow-xs">
              <Lock className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0d2847]">
                Administrator Portal
              </h3>
              <p className="text-xs text-slate-500">PARIVAHAN SCRAPPERS Management</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Notice */}
        <div className="mt-3.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5 text-xs text-slate-600">
          <ShieldAlert className="w-3.5 h-3.5 text-[#0d2847] shrink-0" />
          <span>Restricted to authorized Parivahan Scrappers personnel.</span>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Username Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Admin Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="pscrappers"
                required
                className="w-full pl-9 pr-3 py-2.5 text-sm font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none bg-slate-50/50"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Admin Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-10 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none bg-slate-50/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Remember Me & Save Login Details Checkbox */}
          <div className="flex items-center justify-between pt-1">
            <label
              htmlFor="checkbox-remember-me"
              className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium"
            >
              <input
                id="checkbox-remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-[#0d2847] focus:ring-[#0d2847] border-slate-300 rounded-sm cursor-pointer accent-[#0d2847]"
              />
              <span>Remember username on this device</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="btn-submit-login"
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#0d2847] hover:bg-[#163a63] rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoading ? (
                'Authenticating...'
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Sign In to Portal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
