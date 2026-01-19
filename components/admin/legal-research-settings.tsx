'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Scale,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertCircle,
  Save,
} from 'lucide-react';

interface LegalResearchSettings {
  provider: 'westlaw' | 'lexisnexis' | 'none';
  westlaw_api_key: string;
  westlaw_client_id: string;
  lexisnexis_api_key: string;
  lexisnexis_client_id: string;
  enabled: boolean;
}

export function LegalResearchSettings() {
  const [settings, setSettings] = useState<LegalResearchSettings>({
    provider: 'none',
    westlaw_api_key: '',
    westlaw_client_id: '',
    lexisnexis_api_key: '',
    lexisnexis_client_id: '',
    enabled: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/legal-research');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load legal research settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/legal-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/settings/legal-research/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? 'Connection successful!' : 'Connection failed'),
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isConfigured = settings.provider !== 'none' && (
    (settings.provider === 'westlaw' && settings.westlaw_api_key) ||
    (settings.provider === 'lexisnexis' && settings.lexisnexis_api_key)
  );

  return (
    <Card className="bg-white border-gray-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/20 p-2 rounded-lg">
            <Scale className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold text-navy">Legal Research Integration</CardTitle>
            <CardDescription className="text-gray-400">
              Connect Westlaw or LexisNexis for real-time case law research during motion generation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isConfigured ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Configured
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-600 rounded">
                <XCircle className="h-3.5 w-3.5" />
                Not Configured
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info Box */}
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-indigo-800">Why integrate legal research?</p>
              <p className="mt-1 text-indigo-700">
                When connected, Claude can search for real case law while drafting motions,
                ensuring all citations are verified and current. This eliminates hallucinated
                citations and improves legal accuracy.
              </p>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`p-3 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
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

        {/* Provider Selection */}
        <div className="space-y-2">
          <Label htmlFor="provider">Legal Research Provider</Label>
          <Select
            value={settings.provider}
            onValueChange={(value: 'westlaw' | 'lexisnexis' | 'none') =>
              setSettings((prev) => ({ ...prev, provider: value }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (Disabled)</SelectItem>
              <SelectItem value="westlaw">Westlaw</SelectItem>
              <SelectItem value="lexisnexis">LexisNexis</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Westlaw Settings */}
        {settings.provider === 'westlaw' && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-navy">Westlaw API Credentials</h4>
              <a
                href="https://developer.westlaw.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-teal hover:underline flex items-center gap-1"
              >
                Get API Access <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="westlaw-key">API Key</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="westlaw-key"
                    type="password"
                    value={settings.westlaw_api_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, westlaw_api_key: e.target.value }))
                    }
                    placeholder="Enter your Westlaw API key"
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="westlaw-client">Client ID</Label>
                <Input
                  id="westlaw-client"
                  value={settings.westlaw_client_id}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, westlaw_client_id: e.target.value }))
                  }
                  placeholder="Optional client ID"
                />
              </div>
            </div>
          </div>
        )}

        {/* LexisNexis Settings */}
        {settings.provider === 'lexisnexis' && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-navy">LexisNexis API Credentials</h4>
              <a
                href="https://developer.lexisnexis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-teal hover:underline flex items-center gap-1"
              >
                Get API Access <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lexis-key">API Key</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="lexis-key"
                    type="password"
                    value={settings.lexisnexis_api_key}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, lexisnexis_api_key: e.target.value }))
                    }
                    placeholder="Enter your LexisNexis API key"
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lexis-client">Client ID</Label>
                <Input
                  id="lexis-client"
                  value={settings.lexisnexis_client_id}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, lexisnexis_client_id: e.target.value }))
                  }
                  placeholder="Optional client ID"
                />
              </div>
            </div>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-3 rounded-lg flex items-center gap-2 ${
              testResult.success
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {testResult.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!isConfigured || isTesting || isSaving}
          >
            {isTesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
