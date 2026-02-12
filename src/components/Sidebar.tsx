import React from 'react';
import { 
  Home, 
  Lightbulb, 
  BarChart3, 
  LayoutDashboard, 
  User, 
  Settings, 
  LogOut 
} from 'lucide-react';

interface SidebarProps {
  currentPage: 'available-seats' | 'analytics';
  onPageChange: (page: 'available-seats' | 'analytics') => void;
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const menuItems = [
    { icon: Home, label: 'Home', active: false, page: null },
    { icon: Lightbulb, label: 'Study Tips', active: false, page: null },
    { 
      icon: BarChart3, 
      label: 'Available Seats', 
      active: currentPage === 'available-seats', 
      page: 'available-seats' as const 
    },
    { 
      icon: BarChart3, 
      label: 'Analytics', 
      active: currentPage === 'analytics', 
      page: 'analytics' as const 
    },
    { icon: LayoutDashboard, label: 'Mindfulness', active: false, page: null },
    { icon: User, label: 'User', active: false, page: null },
  ];

  return (
    <aside className="w-64 bg-[#1a1a2e] flex flex-col h-screen">
      {/* App Logo/Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="text-white text-xl font-bold px-2">TMU Seats</div>
        <div className="text-gray-400 text-xs px-2">Study Space Monitor</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.label}>
              <button
                onClick={() => item.page && onPageChange(item.page)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full text-left ${
                  item.active
                    ? 'bg-white text-blue-600'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer Settings */}
      <div className="p-4 border-t border-gray-700">
        <button className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors w-full">
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
        <button className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors w-full">
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}