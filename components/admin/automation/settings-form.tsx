'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  Users,
  Bell,
  FileCheck,
  Clock,
  CheckCircle,
  FileText,
  Settings,
  Save,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SettingRecord {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  description: string | null;
  category: string;
  is_active: boolean;
}

const categoryConfig: Record<string, { icon: typeof Settings; label: string; description: string }> = {
  conflict_checking: {
    icon: Shield,
    label: 'Conflict Checking',
    description: 'Configure automatic conflict detection and resolution',
  },
  clerk_assignment: {
    icon: Users,
    label: 'Clerk Assignment',
    description: 'Configure smart workload-based clerk assignment',
  },
  notifications: {
    icon: Bell,
    label: 'Notifications',
    description: 'Configure email notifications and quiet hours',
  },
  qa_checks: {
    icon: FileCheck,
    label: 'QA Checks',
    description: 'Configure quality assurance for deliverables',
  },
  deadlines: {
    icon: Clock,
    label: 'Deadline Monitoring',
    description: 'Configure deadline alerts and reminders',
  },
  approvals: {
    icon: CheckCircle,
    label: 'Approvals',
    description: 'Configure approval workflow settings',
  },
  reports: {
    icon: FileText,
    label: 'Reports',
    description: 'Configure automated report generation',
  },
  general: {
    icon: Settings,
    label: 'General',
    description: 'General automation settings',
  },
};

export function AutomationSettingsForm({
  groupedSettings,
}: {
  groupedSettings: Record<string, SettingRecord[] | undefined>;
}) {
  const [settings, setSettings] = useState(groupedSettings);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const updateSetting = (key: string, field: string, value: unknown) => {
    setChanged(true);
    setSettings((prev) => {
      const newSettings = { ...prev };
      for (const category of Object.keys(newSettings)) {
        const categorySettings = newSettings[category];
        if (categorySettings) {
          const settingIndex = categorySettings.findIndex((s) => s.setting_key === key);
          if (settingIndex !== -1) {
            const setting = categorySettings[settingIndex];
            newSettings[category] = [
              ...categorySettings.slice(0, settingIndex),
              {
                ...setting,
                setting_value: {
                  ...setting.setting_value,
                  [field]: value,
                },
              },
              ...categorySettings.slice(settingIndex + 1),
            ];
          }
        }
      }
      return newSettings;
    });
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const allSettings: { setting_key: string; setting_value: Record<string, unknown> }[] = [];

      for (const category of Object.values(settings)) {
        if (category) {
          for (const setting of category) {
            allSettings.push({
              setting_key: setting.setting_key,
              setting_value: setting.setting_value,
            });
          }
        }
      }

      const response = await fetch('/api/automation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: allSettings }),
      });

      if (response.ok) {
        toast({
          title: 'Settings saved',
          description: 'Your automation settings have been updated.',
        });
        setChanged(false);
        router.refresh();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      toast({
        title: 'Unable to Save Settings',
        description: 'We couldn\'t update your automation settings. Please try again, or contact support if the issue persists.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Check if there are any settings at all
  const hasAnySettings = Object.values(settings).some(
    (category) => category && category.length > 0
  );

  if (!hasAnySettings) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-3 bg-gray-100 rounded-full mb-4">
            <Settings className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-navy mb-2">No Settings Configured</h3>
          <p className="text-gray-500 max-w-md mb-4">
            Automation settings haven&apos;t been initialized yet. Run the database migration to seed default settings.
          </p>
          <code className="text-xs bg-gray-100 px-3 py-2 rounded font-mono text-gray-600">
            supabase db push
          </code>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(categoryConfig).map(([category, config]) => {
        const categorySettings = settings[category];
        if (!categorySettings || categorySettings.length === 0) return null;

        const Icon = config.icon;

        return (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal/10 rounded-lg">
                  <Icon className="h-5 w-5 text-teal" />
                </div>
                <div>
                  <CardTitle className="text-lg">{config.label}</CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {categorySettings.map((setting) => (
                <SettingRow
                  key={setting.setting_key}
                  setting={setting}
                  onUpdate={(field, value) => updateSetting(setting.setting_key, field, value)}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Save Button */}
      <div className="flex justify-end sticky bottom-6">
        <Button
          onClick={handleSave}
          disabled={!changed || saving}
          className="shadow-lg"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function SettingRow({
  setting,
  onUpdate,
}: {
  setting: SettingRecord;
  onUpdate: (field: string, value: unknown) => void;
}) {
  const value = setting.setting_value;

  // Determine what type of input to show based on the setting
  const hasEnabled = 'enabled' in value;
  const hasValue = 'value' in value;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <Label className="text-sm font-medium text-navy">
          {formatSettingName(setting.setting_key)}
        </Label>
        {setting.description && (
          <p className="text-xs text-gray-500 mt-1">{setting.description}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {hasValue && typeof value.value === 'number' && (
          <Input
            type="number"
            value={value.value as number}
            onChange={(e) => onUpdate('value', parseFloat(e.target.value))}
            className="w-24"
            step={value.value < 1 ? 0.05 : 1}
            min={0}
            max={value.value < 1 ? 1 : undefined}
          />
        )}

        {hasEnabled && (
          <Switch
            checked={value.enabled as boolean}
            onCheckedChange={(checked) => onUpdate('enabled', checked)}
          />
        )}

        {/* Handle array values (like placeholder patterns) */}
        {'patterns' in value && Array.isArray(value.patterns) && (
          <Input
            type="text"
            value={(value.patterns as string[]).join(', ')}
            onChange={(e) =>
              onUpdate(
                'patterns',
                e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              )
            }
            className="w-64"
            placeholder="Comma-separated values"
          />
        )}

        {/* Handle email arrays */}
        {'emails' in value && Array.isArray(value.emails) && (
          <Input
            type="text"
            value={(value.emails as string[]).join(', ')}
            onChange={(e) =>
              onUpdate(
                'emails',
                e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              )
            }
            className="w-64"
            placeholder="Comma-separated emails"
          />
        )}

        {/* Handle time values */}
        {'time' in value && typeof value.time === 'string' && (
          <Input
            type="time"
            value={value.time as string}
            onChange={(e) => onUpdate('time', e.target.value)}
            className="w-32"
          />
        )}

        {/* Handle day selection */}
        {'day' in value && typeof value.day === 'string' && (
          <select
            value={value.day as string}
            onChange={(e) => onUpdate('day', e.target.value)}
            className="w-32 px-3 py-2 border border-gray-200 rounded-md text-sm"
          >
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
            <option value="tuesday">Tuesday</option>
            <option value="wednesday">Wednesday</option>
            <option value="thursday">Thursday</option>
            <option value="friday">Friday</option>
            <option value="saturday">Saturday</option>
          </select>
        )}

        {/* Handle level selection */}
        {'level' in value && typeof value.level === 'string' && (
          <select
            value={value.level as string}
            onChange={(e) => onUpdate('level', e.target.value)}
            className="w-40 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal/50"
          >
            <option value="training_wheels">Training Wheels</option>
            <option value="supervised">Supervised</option>
            <option value="autonomous">Autonomous</option>
            <option value="full_auto">Full Auto</option>
          </select>
        )}

        {/* Handle model selection */}
        {'model' in value && typeof value.model === 'string' && (
          <select
            value={value.model as string}
            onChange={(e) => onUpdate('model', e.target.value)}
            className="w-56 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal/50"
          >
            <option value="claude-opus-4-20250514">Claude Opus 4 (Recommended)</option>
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
          </select>
        )}

        {/* Handle hours values */}
        {'hours' in value && typeof value.hours === 'number' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.hours as number}
              onChange={(e) => onUpdate('hours', parseInt(e.target.value) || 0)}
              className="w-20"
              min={1}
              max={168}
            />
            <span className="text-sm text-gray-500">hours</span>
          </div>
        )}

        {/* Handle max_tokens */}
        {'max_tokens' in value && typeof value.max_tokens === 'number' && (
          <Input
            type="number"
            value={value.max_tokens as number}
            onChange={(e) => onUpdate('max_tokens', parseInt(e.target.value) || 1024)}
            className="w-24"
            min={256}
            max={8192}
            step={256}
          />
        )}

        {/* Handle max_orders (for clerk assignment) */}
        {'max_orders' in value && typeof value.max_orders === 'number' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.max_orders as number}
              onChange={(e) => onUpdate('max_orders', parseInt(e.target.value) || 1)}
              className="w-20"
              min={1}
              max={10}
            />
            <span className="text-sm text-gray-500">orders</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSettingName(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace('Auto Clear', 'Auto-Clear')
    .replace('Auto Assign', 'Auto-Assign')
    .replace('Auto Deliver', 'Auto-Deliver')
    .replace('Auto Escalate', 'Auto-Escalate');
}
