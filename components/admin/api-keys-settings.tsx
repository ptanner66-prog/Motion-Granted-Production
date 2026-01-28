'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertCircle,
  Save,
  Eye,
  EyeOff,
  Sparkles,
  Shield,
  CreditCard,
  Mail,
  Scale,
  FileText,
} from 'lucide-react';

interface APIKeysSettings {
  // Anthropic (Claude AI)
  anthropic_api_key: string;
  anthropic_configured: boolean;
  // OpenAI
  openai_api_key: string;
  openai_configured: boolean;
  // CourtListener
  courtlistener_api_key: string;
  courtlistener_configured: boolean;
  // PACER
  pacer_username: string;
  pacer_password: string;
  pacer_configured: boolean;
  // Stripe
  stripe_secret_key: string;
  stripe_webhook_secret: string;
  stripe_configured: boolean;
  // Resend
  resend_api_key: string;
  resend_configured: boolean;
}

export function APIKeysSettings() {
  const [settings, setSettings] = useState<APIKeysSettings>({
    anthropic_api_key: '',
    anthropic_configured: false,
    openai_api_key: '',
    openai_configured: false,
    courtlistener_api_key: '',
    courtlistener_configured: false,
    pacer_username: '',
    pacer_password: '',
    pacer_configured: false,
    stripe_secret_key: '',
    stripe_webhook_secret: '',
    stripe_configured: false,
    resend_api_key: '',
    resend_configured: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/api-keys');
      if (response.ok) {
        const data = await response.json();
        setSettings(prev => ({
          ...prev,
          ...data,
        }));
      }
    } catch (error) {
      console.error('Failed to load API key settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setMessage({ type: 'success', text: 'API keys saved and applied successfully!' });
      // Reload to get masked values
      await loadSettings();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestKey = async (keyType: 'anthropic' | 'openai' | 'courtlistener' | 'pacer' | 'stripe' | 'resend') => {
    setTestingKey(keyType);
    setTestResults(prev => ({ ...prev, [keyType]: { success: false, message: '' } }));

    try {
      const response = await fetch('/api/settings/api-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyType, settings }),
      });

      const data = await response.json();
      setTestResults(prev => ({
        ...prev,
        [keyType]: {
          success: data.success,
          message: data.message || (data.success ? 'Connection successful!' : 'Connection failed'),
        },
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [keyType]: {
          success: false,
          message: error instanceof Error ? error.message : 'Test failed',
        },
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.startsWith('****')) return key; // Already masked from server
    if (key.length <= 8) return '****';
    return '****' + key.slice(-4);
  };

  if (isLoading) {
    return (
      <Card className="bg-white border-gray-200">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-gray-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-purple-500/20 p-2 rounded-lg">
            <Key className="h-5 w-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold text-navy">API Keys Configuration</CardTitle>
            <CardDescription className="text-gray-400">
              Configure API keys for AI generation, legal research, payments, and email
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Security Notice */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">Secure Storage</p>
              <p className="mt-1 text-amber-700">
                API keys are encrypted and stored securely. Keys entered here will be used
                for all operations. Never share these keys.
              </p>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`p-3 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        {/* Anthropic API Key Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <Sparkles className="h-5 w-5 text-orange-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-navy">Claude AI (Anthropic)</h3>
              <p className="text-sm text-gray-500">Powers all motion generation</p>
            </div>
            {settings.anthropic_configured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-red-500/20 text-red-600 rounded">
                <XCircle className="h-3.5 w-3.5" />
                Required
              </span>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anthropic-key">Anthropic API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="anthropic-key"
                    type={showKeys['anthropic'] ? 'text' : 'password'}
                    value={settings.anthropic_api_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, anthropic_api_key: e.target.value }))
                    }
                    placeholder="sk-ant-api03-..."
                    className="pl-10 pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('anthropic')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['anthropic'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestKey('anthropic')}
                  disabled={!settings.anthropic_api_key || testingKey === 'anthropic'}
                >
                  {testingKey === 'anthropic' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Get your API key from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline inline-flex items-center gap-1"
                  >
                    Anthropic Console <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                {testResults['anthropic'] && (
                  <span className={`text-xs ${testResults['anthropic'].success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults['anthropic'].message}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* OpenAI Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <Sparkles className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-navy">OpenAI</h3>
              <p className="text-sm text-gray-500">GPT models for citation verification</p>
            </div>
            {settings.openai_configured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-600 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                Optional
              </span>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openai-key">OpenAI API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="openai-key"
                    type={showKeys['openai'] ? 'text' : 'password'}
                    value={settings.openai_api_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, openai_api_key: e.target.value }))
                    }
                    placeholder="sk-..."
                    className="pl-10 pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('openai')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['openai'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestKey('openai')}
                  disabled={!settings.openai_api_key || testingKey === 'openai'}
                >
                  {testingKey === 'openai' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Get your API key from{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline inline-flex items-center gap-1"
                  >
                    OpenAI Platform <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                {testResults['openai'] && (
                  <span className={`text-xs ${testResults['openai'].success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults['openai'].message}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CourtListener Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <Scale className="h-5 w-5 text-indigo-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-navy">CourtListener</h3>
              <p className="text-sm text-gray-500">Legal citation verification and case lookup</p>
            </div>
            {settings.courtlistener_configured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-600 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                Optional
              </span>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="courtlistener-key">CourtListener API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="courtlistener-key"
                    type={showKeys['courtlistener'] ? 'text' : 'password'}
                    value={settings.courtlistener_api_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, courtlistener_api_key: e.target.value }))
                    }
                    placeholder="Enter CourtListener API key"
                    className="pl-10 pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('courtlistener')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['courtlistener'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestKey('courtlistener')}
                  disabled={!settings.courtlistener_api_key || testingKey === 'courtlistener'}
                >
                  {testingKey === 'courtlistener' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Get your API key from{' '}
                  <a
                    href="https://www.courtlistener.com/api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline inline-flex items-center gap-1"
                  >
                    CourtListener <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                {testResults['courtlistener'] && (
                  <span className={`text-xs ${testResults['courtlistener'].success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults['courtlistener'].message}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PACER Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <FileText className="h-5 w-5 text-blue-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-navy">PACER</h3>
              <p className="text-sm text-gray-500">Federal court document access (fallback for unpublished opinions)</p>
            </div>
            {settings.pacer_configured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-600 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                Optional
              </span>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pacer-username">PACER Username</Label>
                <Input
                  id="pacer-username"
                  type="text"
                  value={settings.pacer_username}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, pacer_username: e.target.value }))
                  }
                  placeholder="Enter PACER username"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pacer-password">PACER Password</Label>
                <div className="relative">
                  <Input
                    id="pacer-password"
                    type={showKeys['pacer'] ? 'text' : 'password'}
                    value={settings.pacer_password}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, pacer_password: e.target.value }))
                    }
                    placeholder="Enter PACER password"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('pacer')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['pacer'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500">
                  Register at{' '}
                  <a
                    href="https://pacer.uscourts.gov/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline inline-flex items-center gap-1"
                  >
                    PACER <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <p className="text-xs text-amber-600">~$0.10 per lookup, $50/month budget cap enforced</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestKey('pacer')}
                disabled={!settings.pacer_username || !settings.pacer_password || testingKey === 'pacer'}
              >
                {testingKey === 'pacer' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Test'
                )}
              </Button>
            </div>
            {testResults['pacer'] && (
              <p className={`text-xs ${testResults['pacer'].success ? 'text-green-600' : 'text-red-600'}`}>
                {testResults['pacer'].message}
              </p>
            )}
          </div>
        </div>

        {/* Stripe Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <CreditCard className="h-5 w-5 text-purple-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-navy">Stripe</h3>
              <p className="text-sm text-gray-500">Payment processing</p>
            </div>
            {settings.stripe_configured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-600 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                Optional
              </span>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stripe-secret">Secret Key</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="stripe-secret"
                    type={showKeys['stripe_secret'] ? 'text' : 'password'}
                    value={settings.stripe_secret_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, stripe_secret_key: e.target.value }))
                    }
                    placeholder="sk_live_..."
                    className="pl-10 pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('stripe_secret')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['stripe_secret'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-webhook">Webhook Secret</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="stripe-webhook"
                    type={showKeys['stripe_webhook'] ? 'text' : 'password'}
                    value={settings.stripe_webhook_secret}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, stripe_webhook_secret: e.target.value }))
                    }
                    placeholder="whsec_..."
                    className="pl-10 pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('stripe_webhook')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['stripe_webhook'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Get your API keys from{' '}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal hover:underline inline-flex items-center gap-1"
                >
                  Stripe Dashboard <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestKey('stripe')}
                disabled={!settings.stripe_secret_key || testingKey === 'stripe'}
              >
                {testingKey === 'stripe' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Test'
                )}
              </Button>
            </div>
            {testResults['stripe'] && (
              <p className={`text-xs ${testResults['stripe'].success ? 'text-green-600' : 'text-red-600'}`}>
                {testResults['stripe'].message}
              </p>
            )}
          </div>
        </div>

        {/* Resend Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b">
            <Mail className="h-5 w-5 text-pink-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-navy">Resend</h3>
              <p className="text-sm text-gray-500">Transactional email delivery</p>
            </div>
            {settings.resend_configured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-600 rounded">
                <AlertCircle className="h-3.5 w-3.5" />
                Optional
              </span>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-key">Resend API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="resend-key"
                    type={showKeys['resend'] ? 'text' : 'password'}
                    value={settings.resend_api_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, resend_api_key: e.target.value }))
                    }
                    placeholder="re_..."
                    className="pl-10 pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey('resend')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKeys['resend'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestKey('resend')}
                  disabled={!settings.resend_api_key || testingKey === 'resend'}
                >
                  {testingKey === 'resend' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Get your API key from{' '}
                  <a
                    href="https://resend.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal hover:underline inline-flex items-center gap-1"
                  >
                    Resend Dashboard <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                {testResults['resend'] && (
                  <span className={`text-xs ${testResults['resend'].success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults['resend'].message}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving} size="lg">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save All API Keys
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
