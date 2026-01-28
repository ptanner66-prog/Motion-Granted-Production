import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { AutomationSettingsForm } from '@/components/admin/automation/settings-form';

export const metadata: Metadata = {
  title: 'Automation Settings',
  description: 'Configure automation settings for Motion Granted.',
};

export default async function AutomationSettingsPage() {
  const supabase = await createClient();

  // Fetch all settings
  const { data: settings } = await supabase
    .from('automation_settings')
    .select('*')
    .order('category')
    .order('setting_key');

  // Group settings by category
  const grouped: Record<string, typeof settings> = {};
  for (const setting of settings || []) {
    if (!grouped[setting.category]) {
      grouped[setting.category] = [];
    }
    grouped[setting.category].push(setting);
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/automation">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight">
            Automation Settings
          </h1>
          <p className="text-gray-500 mt-1">
            Configure how the AI automation system operates
          </p>
        </div>
      </div>

      <AutomationSettingsForm groupedSettings={grouped} />
    </div>
  );
}
