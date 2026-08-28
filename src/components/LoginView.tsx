import React, { useState } from 'react';
import { Cpu, ShieldCheck, Zap, Activity, Laptop, Clock } from 'lucide-react';

interface LoginViewProps {
  onLoginWithGoogle: () => Promise<any>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginWithGoogle }) => {
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      setIsRedirecting(true);
    }

    try {
      await onLoginWithGoogle();
    } catch (err: any) {
      setIsRedirecting(false);
      console.warn('[GOOGLE_LOGIN] Sign-in attempt result:', err);
      const errMsg = String(err?.message || err?.code || '');
      const errLower = errMsg.toLowerCase();

      if (
        errLower.includes('popup-closed-by-user') ||
        errLower.includes('cancelled-popup-request') ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        // User closed popup
        setError(null);
      } else if (errLower.includes('popup-blocked') || err?.code === 'auth/popup-blocked') {
        setError('Popup blocked by browser. Redirecting to Google Sign-In...');
      } else if (
        err?.code === 'auth/network-request-failed' ||
        errLower.includes('network-request-failed')
      ) {
        setError('Network connectivity notice. Please check your connection and try again.');
      } else {
        setError(err?.message || 'Google Authentication encountered an issue. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative">
      
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 sm:space-y-8 shadow-sm">
        
        {/* Brand Logo & Heading */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white mx-auto shadow-sm">
            <Cpu className="w-7 h-7 text-white" />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">SYSTEM USAGE LOGGER</h1>
            <p className="text-xs text-blue-600 font-bold tracking-wide uppercase">
              syslogger-pro
            </p>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            Automated computer usage monitoring & reporting platform with real-time Windows event tracking.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs text-center">
            {error}
          </div>
        )}

        {/* Google Authentication Section */}
        <div className="space-y-4">
          <button
            id="btn-login-google"
            onClick={handleGoogleLogin}
            disabled={loading || isRedirecting}
            className="w-full min-h-[48px] flex items-center justify-center space-x-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold px-4 py-3 rounded-xl border border-slate-300 shadow-xs transition duration-150 disabled:opacity-50 text-sm cursor-pointer"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="truncate">
              {isRedirecting
                ? 'Redirecting to Google...'
                : loading
                ? 'Authenticating with Google...'
                : 'Continue with Google'}
            </span>
          </button>

          <p className="text-[11px] text-slate-500 text-center leading-normal">
            No separate password required. Secure Google Sign-In with automatic cross-device support.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="border-t border-slate-200 pt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          <div className="flex items-start space-x-2 text-[11px] text-slate-600">
            <Zap className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>Automatic Agent Logging</span>
          </div>
          <div className="flex items-start space-x-2 text-[11px] text-slate-600">
            <Laptop className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Multi-Device (15+ PCs)</span>
          </div>
          <div className="flex items-start space-x-2 text-[11px] text-slate-600">
            <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>Automated Usage Reports</span>
          </div>
          <div className="flex items-start space-x-2 text-[11px] text-slate-600">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Firebase Security Rules</span>
          </div>
        </div>

      </div>

    </div>
  );
};
