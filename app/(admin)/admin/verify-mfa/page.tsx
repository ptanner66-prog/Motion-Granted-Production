'use client';

/**
 * Admin MFA Verification Page
 *
 * SEC-002: Shown when admin has MFA enrolled but current session is AAL1.
 * Enter TOTP code to upgrade session to AAL2.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Shield, Loader2, AlertTriangle } from 'lucide-react';

export default function VerifyMFAPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFactorId();
  }, []);

  async function loadFactorId() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/status');
      const data = await res.json();

      if (data.factorId) {
        setFactorId(data.factorId);
      } else {
        // No factor enrolled, redirect to setup
        router.replace('/admin/setup-mfa');
      }
    } catch {
      setError('Failed to load MFA status');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !code.trim()) return;

    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factorId, code: code.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid code. Please try again.');
        setCode('');
        return;
      }

      // Session upgraded to AAL2, redirect to admin
      router.push('/admin');
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto rounded-full bg-navy/10 p-3 w-fit mb-2">
            <Shield className="h-8 w-8 text-navy" />
          </div>
          <CardTitle className="text-2xl text-navy">Verify Your Identity</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app to access the admin panel.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-navy" />
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-navy hover:bg-navy/90"
                disabled={code.length !== 6 || isVerifying}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
