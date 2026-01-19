import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchCases, isLegalResearchConfigured } from '@/lib/legal-research';

// POST - Test legal research connection
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check if configured
    if (!isLegalResearchConfigured()) {
      return NextResponse.json({
        success: false,
        message: 'Legal research is not configured. Add API keys as environment variables (WESTLAW_API_KEY or LEXISNEXIS_API_KEY).',
      });
    }

    // Try a simple test search
    const testResult = await searchCases({
      query: 'test connection',
      maxResults: 1,
    });

    if (testResult.success) {
      return NextResponse.json({
        success: true,
        message: `Connection successful! Provider: ${testResult.provider}`,
        provider: testResult.provider,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: testResult.error || 'Connection test failed',
        provider: testResult.provider,
      });
    }
  } catch (error) {
    console.error('Error testing legal research connection:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
}
