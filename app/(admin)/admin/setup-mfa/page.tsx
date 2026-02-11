'use client';

/**
 * Admin MFA Setup Page
 *
 * SEC-002: Admin accounts must enroll TOTP-based MFA.
 * This page generates a QR code for authenticator app enrollment.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Shield, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

export default function SetupMFAPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    enrollFactor();
  }, []);

  async function enrollFactor() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/mfa/enroll', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to start MFA enrollment');
        return;
      }

      setFactorId(data.factorId);
      setQrCode(data.qrCode);
      setSecret(data.secret);
    } catch {
      setError('Failed to connect to server');
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
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/admin'), 2000);
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-navy mb-2">MFA Enabled</h2>
            <p className="text-gray-600">
              Your account is now protected with two-factor authentication.
              Redirecting to admin dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto rounded-full bg-navy/10 p-3 w-fit mb-2">
            <Shield className="h-8 w-8 text-navy" />
          </div>
          <CardTitle className="text-2xl text-navy">Set Up Two-Factor Authentication</CardTitle>
          <CardDescription>
            Admin accounts require MFA for security. Scan the QR code with your
            authenticator app (Google Authenticator, Authy, 1Password, etc.)
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-navy" />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {qrCode && (
            <>
              {/* QR Code */}
              <div className="flex justify-center">
                <img
                  src={qrCode}
                  alt="Scan this QR code with your authenticator app"
                  className="w-48 h-48 border border-gray-200 rounded-lg"
                />
              </div>

              {/* Manual entry secret */}
              {secret && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">
                    Can&apos;t scan? Enter this code manually:
                  </p>
                  <code className="text-sm font-mono text-navy break-all select-all">
                    {secret}
                  </code>
                </div>
              )}

              {/* Verification form */}
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label htmlFor="totp-code" className="block text-sm font-medium text-gray-700 mb-1">
                    Enter the 6-digit code from your authenticator app
                  </label>
                  <Input
                    id="totp-code"
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
                    'Verify & Enable MFA'
                  )}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
