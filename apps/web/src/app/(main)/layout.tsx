'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Shield, LayoutDashboard, Settings, LogOut, ChevronRight } from 'lucide-react';
import { trpc } from '@/trpc/client';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  
  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => router.push('/login'),
  });

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Account Settings', href: '/account', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col backdrop-blur-xl">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800">
          <Shield className="w-6 h-6 text-emerald-400 mr-2" />
          <span className="font-bold text-lg text-zinc-100 tracking-tight">AI-Gatekeeper</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-zinc-800 text-emerald-400 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'}`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-zinc-200">{user?.displayName || 'Loading...'}</span>
              <span className="text-xs text-zinc-500">{user?.email || ''}</span>
            </div>
            <button 
              onClick={() => logoutMutation.mutate()}
              className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header placeholder (optional) */}
        <header className="h-16 border-b border-zinc-800 bg-zinc-900/30 flex items-center px-8 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center text-sm text-zinc-400">
            <span className="font-semibold text-zinc-500 mr-2">AI-Gatekeeper</span>
            <ChevronRight className="w-4 h-4 mr-2" />
            <Link href="/dashboard" className="hover:text-zinc-200 transition-colors">
              Dashboard
            </Link>
            
            {pathname === '/projects/new' && (
              <>
                <ChevronRight className="w-4 h-4 mx-2" />
                <span className="text-zinc-200 font-medium">New Project</span>
              </>
            )}
            
            {pathname.startsWith('/projects/') && pathname !== '/projects/new' && (
              <>
                <ChevronRight className="w-4 h-4 mx-2" />
                <span className="text-zinc-200 font-medium">Project Details</span>
              </>
            )}
            
            {pathname === '/account' && (
              <>
                <ChevronRight className="w-4 h-4 mx-2" />
                <span className="text-zinc-200 font-medium">Account Settings</span>
              </>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
