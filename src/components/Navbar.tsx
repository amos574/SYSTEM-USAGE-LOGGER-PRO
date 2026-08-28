import React from 'react';
import { UserProfile } from '../types';
import { LogOut, Monitor, Shield, Activity, Clock, Cpu, Menu, X } from 'lucide-react';

interface NavbarProps {
  user: UserProfile;
  onLogout: () => void;
  onlineCount: number;
  totalDevices: number;
  mobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onlineCount,
  totalDevices,
  mobileMenuOpen = false,
  onToggleMobileMenu,
}) => {
  return (
    <header id="main-navbar" className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Mobile Toggle & Brand Title */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {onToggleMobileMenu && (
            <button
              id="btn-mobile-menu-toggle"
              type="button"
              onClick={onToggleMobileMenu}
              aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <span className="font-bold text-sm sm:text-lg tracking-tight text-slate-900 truncate">
                SYSTEM USAGE LOGGER
              </span>
              <span className="bg-blue-50 text-blue-700 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                PRO
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">Automated Windows Event Collector & Usage Engine</p>
          </div>
        </div>

        {/* Live Status Indicators & User Profile */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          
          {/* Active Device Counter Pill */}
          <div id="status-pill" className="flex items-center space-x-1.5 sm:space-x-2 bg-emerald-50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-emerald-200 text-[11px] sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-700 font-medium whitespace-nowrap">
              <strong className="text-emerald-700 font-bold">{onlineCount}</strong>
              <span className="hidden sm:inline"> / {totalDevices} Devices Online</span>
              <span className="sm:hidden text-slate-500 text-[10px]"> live</span>
            </span>
          </div>

          {/* User Profile */}
          <div className="flex items-center space-x-2 sm:space-x-3 pl-1.5 sm:pl-2 border-l border-slate-200">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <div className="hidden lg:block text-left">
              <div className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">
                {user.displayName || 'Authenticated User'}
              </div>
              <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{user.email}</div>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            id="btn-logout"
            onClick={onLogout}
            className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
            title="Sign Out from System Usage Logger"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>

      </div>
    </header>
  );
};
