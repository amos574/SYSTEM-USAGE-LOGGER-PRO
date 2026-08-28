import React from 'react';
import {
  LayoutDashboard,
  Laptop,
  Clock,
  Activity,
  FileSpreadsheet,
  HardDrive,
  Mail,
  Users,
  FlaskConical,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { NavTab } from '../types';

export type { NavTab };

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const items: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Devices', icon: Laptop },
    { id: 'history', label: 'Usage History', icon: Clock },
    { id: 'events', label: 'System Events', icon: Activity },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { id: 'google-drive', label: 'Google Drive', icon: HardDrive },
    { id: 'gmail', label: 'Gmail', icon: Mail },
    { id: 'recipients', label: 'Recipients', icon: Users },
    { id: 'test-pipeline', label: 'Test Pipeline', icon: FlaskConical },
    { id: 'settings', label: 'Settings & Account', icon: Settings },
  ];

  const handleTabClick = (tab: NavTab) => {
    onSelectTab(tab);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navContent = (
    <div className="flex-1 flex flex-col justify-between p-4 h-full overflow-y-auto">
      <nav className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Main Navigation
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-bold border border-blue-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-3 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></div>}
            </button>
          );
        })}
      </nav>

      {/* Security Status Footnote */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1.5 mt-4">
        <div className="flex items-center space-x-1.5 text-blue-700 font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>Firebase Protected</span>
        </div>
        <p className="text-slate-500 leading-relaxed text-[10px]">
          Multi-tenant data isolation enabled. Authenticated via Google.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        id="main-sidebar"
        className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-200 text-slate-700 min-h-[calc(100vh-4rem)] flex-col justify-between"
      >
        {navContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex" id="mobile-sidebar-drawer">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer Container */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl z-10 animate-in slide-in-from-left duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                System Navigation
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
