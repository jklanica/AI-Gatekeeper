import { Suspense } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';
import { ResetPasswordForm } from './_components/ResetPasswordForm';

/**
 * ResetPasswordPage Component
 * 
 * Wraps the ResetPasswordForm in a React Suspense boundary since it depends
 * on URL search parameters (`useSearchParams`).
 * 
 * @returns {JSX.Element} The rendered reset password page wrapper.
 */
export default function ResetPasswordPage() {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
      <CardHeader className="space-y-2 text-center">
        <div className="flex justify-center mb-2">
          <div className="p-3 rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/50">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-zinc-100">Set New Password</CardTitle>
        <CardDescription className="text-zinc-400">
          Enter your new password below.
        </CardDescription>
      </CardHeader>
      <Suspense fallback={<div className="p-8 text-center text-zinc-400">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </Card>
  );
}
