import React from 'react';
import {
  FileText,
  PlusCircle,
  ShieldCheck,
  LayoutDashboard,
  Settings,
  Lock,
  LogOut,
  ScanLine,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import { PScrapLogo } from './PScrapLogo';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isAdmin: boolean;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenDirectPdf?: () => void;
  isMainAdmin?: boolean;
  onRequestMainAdmin?: () => void;
  onLogoutMainAdmin?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  isAdmin,
  onOpenLogin,
  onLogout,
  onOpenDirectPdf,
  isMainAdmin = false,
  onRequestMainAdmin,
  onLogoutMainAdmin,
}) => {
  const isVerificationMode = currentTab === 'verify' || (!isAdmin && currentTab === 'view-certificate');

  return (
    <header className="no-print bg-[#0d2847] text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <button
            type="button"
            onClick={() => onSelectTab(isAdmin ? 'create' : 'verify')}
            className="flex items-center gap-2.5 sm:gap-3 text-left group cursor-pointer"
          >
            <PScrapLogo size="sm" variant="light" />
            <div className="border-l border-white/20 pl-2.5 hidden sm:block">
              <span className="font-bold text-base sm:text-lg tracking-tight block leading-tight font-serif text-white">
                PARIVAHAN SCRAPPERS
              </span>
              <span className="text-[10px] text-emerald-300 block leading-tight font-medium">
                {isVerificationMode
                  ? 'Official Verification Registry'
                  : isMainAdmin
                  ? 'Main Core Admin Console'
                  : 'Private Certificate Maker Desk'}
              </span>
            </div>
          </button>

          {/* Navigation Links - Strict Role Isolation */}
          <nav className="hidden md:flex items-center space-x-1.5">
            {isVerificationMode ? (
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-1.5 rounded-lg bg-emerald-900/70 border border-emerald-600/40 text-emerald-200 text-xs font-bold flex items-center gap-2 shadow-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Certification Tool
                </span>
              </div>
            ) : isAdmin && isMainAdmin ? (
              /* MAIN_CORE_ADMIN: Full access to all tabs */
              <>
                <button
                  id="nav-tab-create"
                  type="button"
                  onClick={() => onSelectTab('create')}
                  className={`px-3 py-2 rounded-md text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'create'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-700/60 hover:bg-emerald-600 text-white'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 text-emerald-200" />
                  Make Certificate
                </button>

                <button
                  id="nav-tab-certificates"
                  type="button"
                  onClick={() => onSelectTab('certificates')}
                  className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'certificates'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-200 hover:bg-[#163a63] hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>All Certificates</span>
                </button>

                {onOpenDirectPdf && (
                  <button
                    id="nav-tab-direct-pdf"
                    type="button"
                    onClick={onOpenDirectPdf}
                    className="px-3 py-2 rounded-md text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer text-emerald-300 hover:text-white hover:bg-emerald-800/40 border border-emerald-500/30 shadow-2xs"
                    title="Add Direct PDF: auto-scan database to match existing records or register"
                  >
                    <ScanLine className="w-4 h-4 text-emerald-400" />
                    <span>Add Direct PDF</span>
                  </button>
                )}

                <button
                  id="nav-tab-dashboard"
                  type="button"
                  onClick={() => onSelectTab('dashboard')}
                  className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'dashboard'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-200 hover:bg-[#163a63] hover:text-white'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                  Main Core Admin
                </button>

                <button
                  id="nav-tab-verify"
                  type="button"
                  onClick={() => onSelectTab('verify')}
                  className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'verify'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-200 hover:bg-[#163a63] hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Verify Tool
                </button>

                <button
                  id="nav-tab-settings"
                  type="button"
                  onClick={() => onSelectTab('settings')}
                  className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'settings'
                      ? 'bg-slate-800 text-white shadow-inner'
                      : 'text-slate-200 hover:bg-[#163a63] hover:text-white'
                  }`}
                >
                  <Settings className="w-4 h-4 text-emerald-400" />
                  Settings
                </button>

                {onLogoutMainAdmin && (
                  <button
                    id="nav-tab-lock-core-admin"
                    type="button"
                    onClick={onLogoutMainAdmin}
                    className="px-2.5 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-amber-300 hover:text-white hover:bg-amber-900/40 border border-amber-600/40 ml-1"
                    title="Exit Main Core Admin and return to restricted Certificate Maker mode"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Lock Core Admin
                  </button>
                )}
              </>
            ) : isAdmin ? (
              /* CERTIFICATE_MAKER: Strictly restricted to Make Certificate + Discreet Main Core Admin button */
              <>
                <button
                  id="nav-tab-create"
                  type="button"
                  onClick={() => onSelectTab('create')}
                  className={`px-3.5 py-2 rounded-md text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'create'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-700/60 hover:bg-emerald-600 text-white'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 text-emerald-200" />
                  Make Certificate
                </button>

                {onRequestMainAdmin && (
                  <button
                    id="nav-btn-main-core-admin"
                    type="button"
                    onClick={onRequestMainAdmin}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer text-slate-300 hover:text-white bg-white/5 hover:bg-white/15 border border-white/15 ml-2"
                    title="Unlock Main Core Admin Dashboard"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-300" />
                    <span>Main Core Admin</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab('login')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'login'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-emerald-300" />
                  Admin Login
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('verify')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    currentTab === 'verify'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  Verify Certificate
                </button>
              </div>
            )}
          </nav>

          {/* Right Action / Auth Status */}
          <div className="flex items-center gap-2">
            {isVerificationMode ? (
              <button
                id="btn-nav-admin-login-panel"
                type="button"
                onClick={() => onOpenLogin()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/25 transition-all cursor-pointer shadow-xs"
                title="Admin Login Panel"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-300" />
                <span>Admin Login Panel</span>
              </button>
            ) : isAdmin ? (
              <div className="flex items-center gap-2">
                {isMainAdmin ? (
                  <span className="hidden sm:inline-flex items-center gap-1 text-xs bg-amber-950/90 text-amber-300 border border-amber-600/50 px-2.5 py-1 rounded-full font-bold">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    Main Core Admin
                  </span>
                ) : (
                  <span className="hidden sm:inline-block text-xs bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 px-2.5 py-1 rounded-full font-medium">
                    Certificate Maker
                  </span>
                )}
                <button
                  id="btn-admin-logout"
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-200 hover:text-white bg-rose-600/30 hover:bg-rose-600 rounded-md border border-rose-500/40 transition-colors cursor-pointer shadow-xs"
                  title="Log out and return to Login screen"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                id="btn-admin-login"
                type="button"
                onClick={() => onSelectTab('login')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentTab === 'login'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-white" />
                Admin Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation bar */}
        {isVerificationMode ? (
          <div className="md:hidden flex items-center justify-between py-2 px-3 border-t border-slate-700/60 bg-[#0a1f36]">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Certification Tool</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenLogin()}
              className="px-3 py-1.5 text-xs font-bold text-slate-100 bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 flex items-center gap-1.5 min-h-[36px]"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-300" />
              <span>Admin Login Panel</span>
            </button>
          </div>
        ) : (
          <div className="md:hidden flex items-center justify-around py-2.5 border-t border-slate-700 text-xs overflow-x-auto gap-1">
            {isAdmin && isMainAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => onSelectTab('create')}
                  className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1 whitespace-nowrap min-h-[40px] ${
                    currentTab === 'create'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-700/60 text-white'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Make Cert
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('certificates')}
                  className={`px-2.5 py-2 rounded-lg whitespace-nowrap min-h-[40px] flex items-center gap-1 ${
                    currentTab === 'certificates'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-300'
                  }`}
                >
                  <span>All Certs</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('dashboard')}
                  className={`px-2.5 py-2 rounded-lg whitespace-nowrap min-h-[40px] flex items-center ${
                    currentTab === 'dashboard'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-300'
                  }`}
                >
                  Core Admin
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('settings')}
                  className={`px-2.5 py-2 rounded-lg whitespace-nowrap min-h-[40px] flex items-center ${
                    currentTab === 'settings'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-300'
                  }`}
                >
                  Settings
                </button>
                {onLogoutMainAdmin && (
                  <button
                    type="button"
                    onClick={onLogoutMainAdmin}
                    className="px-2.5 py-2 rounded-lg whitespace-nowrap min-h-[40px] flex items-center gap-1 font-bold text-amber-300 bg-amber-950/60 border border-amber-700/50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Lock Core
                  </button>
                )}
              </>
            ) : isAdmin ? (
              <div className="flex items-center justify-between w-full px-1 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab('create')}
                  className="px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 bg-emerald-600 text-white min-h-[40px]"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Make Certificate
                </button>
                {onRequestMainAdmin && (
                  <button
                    type="button"
                    onClick={onRequestMainAdmin}
                    className="px-3 py-2 rounded-lg font-semibold flex items-center gap-1.5 text-slate-200 bg-white/10 border border-white/15 min-h-[40px]"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-300" />
                    Main Core Admin
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between w-full px-1 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab('login')}
                  className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 min-h-[40px] ${
                    currentTab === 'login'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/10 text-slate-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Admin Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('verify')}
                  className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 min-h-[40px] ${
                    currentTab === 'verify'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/10 text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Customer Verify
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
