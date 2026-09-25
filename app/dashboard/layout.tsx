'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { DashboardShell } from '@/components/dashboard-shell';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, organization } = useAuth();
  const router = useRouter();
  const [orgLoaded, setOrgLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth');
    }
    if (!loading && user) {
      setOrgLoaded(true);
    }
  }, [loading, user, router]);

  if (loading || (!orgLoaded && !organization)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) return null;

  return <DashboardShell>{children}</DashboardShell>;
}
