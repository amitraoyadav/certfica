import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, PlusCircle, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoToMaker = () => {
    window.location.href = '/create';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-white rounded-2xl border border-rose-200 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-rose-900 to-[#0d2847] px-6 py-4 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-300" />
              </div>
              <div>
                <h3 className="text-base font-bold font-serif">
                  {this.props.fallbackTitle || 'Application Recovery Mode'}
                </h3>
                <p className="text-xs text-rose-200">
                  Data Vault &amp; Certificate Database Remain Safe
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {this.props.fallbackMessage ||
                      'The view encountered a temporary rendering or data formatting anomaly. Your certificates and credentials are secure.'}
                  </p>
                  {this.state.error?.message && (
                    <p className="text-[11px] font-mono text-amber-800 break-all bg-amber-100/60 p-2 rounded">
                      {this.state.error.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="px-4 py-2 bg-[#0d2847] hover:bg-[#163a63] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-sky-300" />
                  <span>Retry View</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={this.handleGoToMaker}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Certificate Maker</span>
                  </button>

                  <button
                    type="button"
                    onClick={this.handleReload}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Reload Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
