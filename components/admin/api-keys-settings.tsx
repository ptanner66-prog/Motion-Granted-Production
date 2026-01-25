'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Scale,
  Shield,
  Search,
  BookOpen,
} from 'lucide-react';

interface APIKeysSettings {
  // Anthropic (Required)
  anthropic_api_key: string;
  anthropic_configured: boolean;
  // CourtListener (Required for CIV)
  courtlistener_api_key: string;
  courtlistener_configured: boolean;
  // Case.law (Required for CIV)
  caselaw_api_key: string;
  caselaw_configured: boolean;
  // Westlaw (Optional Premium)
  westlaw_api_key: string;
  westlaw_client_id: string;
  westlaw_enabled: boolean;
  // LexisNexis (Optional Premium)
  lexisnexis_api_key: string;
  lexisnexis_client_id: string;
  lexisnexis_enabled: boolean;
  // Legal research provider preference
  legal_research_provider: 'westlaw' | 'lexisnexis' | 'none';
}

export function APIKeysSettings() {
  const [settings, setSettings] = useState<APIKeysSettings>({
    anthropic_api_key: '',
    anthropic_configured: false,
    courtlistener_api_key: '',
    courtlistener_configured: false,
    caselaw_api_key: '',
    caselaw_configured: false,
    westlaw_api_key: '',
    westlaw_client_id: '',
    westlaw_enabled: false,
    lexisnexis_api_key: '',
    lexisnexis_client_id: '',
    lexisnexis_enabled: false,
    legal_research_provider: 'none',
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

  const handleTestKey = async (keyType: 'anthropic' | 'courtlistener' | 'caselaw' | 'westlaw' | 'lexisnexis') => {
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
              Configure API keys for AI, citation verification, and legal research
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
                API keys are encrypted with AES-256-GCM and stored securely. Keys entered here will be used
                for motion generation, citation verification, and legal research. Never share these keys.
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

        {/* ========== REQUIRED SECTION ========== */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-navy border-b pb-2">Required API Keys</h2>

          {/* Anthropic API Key Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
              <Sparkles className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-navy">Claude AI (Anthropic)</h3>
                <p className="text-sm text-gray-500">Powers all motion generation and AI analysis</p>
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

          {/* CourtListener API Key Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
              <Search className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-navy">CourtListener (Free Law Project)</h3>
                <p className="text-sm text-gray-500">Primary source for citation verification (CIV Step 1)</p>
              </div>
              {settings.courtlistener_configured ? (
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
                <Label htmlFor="courtlistener-key">CourtListener API Token</Label>
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
                      placeholder="Enter CourtListener API token"
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
                    Get your free API token from{' '}
                    <a
                      href="https://www.courtlistener.com/help/api/rest/#permissions"
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

          {/* Case.law API Key Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
              <BookOpen className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-navy">Case.law (Harvard Law)</h3>
                <p className="text-sm text-gray-500">Secondary source for citation verification (CIV fallback)</p>
              </div>
              {settings.caselaw_configured ? (
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
                <Label htmlFor="caselaw-key">Case.law API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="caselaw-key"
                      type={showKeys['caselaw'] ? 'text' : 'password'}
                      value={settings.caselaw_api_key}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, caselaw_api_key: e.target.value }))
                      }
                      placeholder="Enter Case.law API key"
                      className="pl-10 pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('caselaw')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showKeys['caselaw'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestKey('caselaw')}
                    disabled={!settings.caselaw_api_key || testingKey === 'caselaw'}
                  >
                    {testingKey === 'caselaw' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Get your free API key from{' '}
                    <a
                      href="https://case.law/user/register/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline inline-flex items-center gap-1"
                    >
                      Case.law <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                  {testResults['caselaw'] && (
                    <span className={`text-xs ${testResults['caselaw'].success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults['caselaw'].message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========== OPTIONAL PREMIUM SECTION ========== */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b pb-2">
            <h2 className="text-lg font-semibold text-navy">Premium Legal Research (Optional)</h2>
            <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">Premium</span>
          </div>
          <p className="text-sm text-gray-500">
            Optional integrations with premium legal research providers for enhanced citation verification.
            The system works without these, but they provide additional verification sources.
          </p>

          {/* Westlaw */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-indigo-500" />
                <div>
                  <h4 className="font-medium text-navy">Westlaw</h4>
                  <p className="text-xs text-gray-500">Thomson Reuters legal research</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={settings.westlaw_enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      westlaw_enabled: checked,
                      legal_research_provider: checked ? 'westlaw' : (prev.lexisnexis_enabled ? 'lexisnexis' : 'none'),
                    }))
                  }
                />
                <a
                  href="https://developer.westlaw.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal hover:underline flex items-center gap-1"
                >
                  Get Access <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {settings.westlaw_enabled && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="westlaw-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="westlaw-key"
                      type={showKeys['westlaw'] ? 'text' : 'password'}
                      value={settings.westlaw_api_key}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, westlaw_api_key: e.target.value }))
                      }
                      placeholder="Enter Westlaw API key"
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('westlaw')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showKeys['westlaw'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="westlaw-client">Client ID (optional)</Label>
                  <Input
                    id="westlaw-client"
                    value={settings.westlaw_client_id}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, westlaw_client_id: e.target.value }))
                    }
                    placeholder="Optional client ID"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* LexisNexis */}
          <div className="p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-red-500" />
                <div>
                  <h4 className="font-medium text-navy">LexisNexis</h4>
                  <p className="text-xs text-gray-500">RELX legal research platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={settings.lexisnexis_enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      lexisnexis_enabled: checked,
                      legal_research_provider: checked ? 'lexisnexis' : (prev.westlaw_enabled ? 'westlaw' : 'none'),
                    }))
                  }
                />
                <a
                  href="https://developer.lexisnexis.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal hover:underline flex items-center gap-1"
                >
                  Get Access <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {settings.lexisnexis_enabled && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="lexis-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="lexis-key"
                      type={showKeys['lexisnexis'] ? 'text' : 'password'}
                      value={settings.lexisnexis_api_key}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, lexisnexis_api_key: e.target.value }))
                      }
                      placeholder="Enter LexisNexis API key"
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('lexisnexis')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showKeys['lexisnexis'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lexis-client">Client ID (optional)</Label>
                  <Input
                    id="lexis-client"
                    value={settings.lexisnexis_client_id}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, lexisnexis_client_id: e.target.value }))
                    }
                    placeholder="Optional client ID"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            )}
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
