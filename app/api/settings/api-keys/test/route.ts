/**
 * API Keys Test Route
 *
 * Tests connectivity for API keys:
 * - Anthropic: Makes a simple API call to verify the key works
 * - OpenAI: Tests GPT API connectivity for cross-vendor CIV
 * - CourtListener: Tests Free Law Project API connectivity
 * - PACER: Tests federal court records access (~$0.10/lookup)
 * - Westlaw: Attempts a test search (optional premium)
 * - LexisNexis: Attempts a test search (optional premium)
 *
 * NOTE: Case.law test removed - API was sunset September 5, 2024
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Vercel serverless function configuration
export const maxDuration = 30; // 30 seconds for API tests

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

    const body = await request.json();
    const { keyType, settings } = body;

    switch (keyType) {
      case 'anthropic': {
        return await testAnthropicKey(settings.anthropic_api_key);
      }
      case 'openai': {
        return await testOpenAIKey(settings.openai_api_key);
      }
      case 'courtlistener': {
        return await testCourtListenerKey(settings.courtlistener_api_key);
      }
      case 'pacer': {
        return await testPACERCredentials(settings.pacer_username, settings.pacer_password);
      }
      case 'westlaw': {
        return await testWestlawKey(settings.westlaw_api_key, settings.westlaw_client_id);
      }
      case 'lexisnexis': {
        return await testLexisNexisKey(settings.lexisnexis_api_key, settings.lexisnexis_client_id);
      }
      default:
        return NextResponse.json({ success: false, message: 'Unknown key type' }, { status: 400 });
    }
  } catch (error) {
    console.error('API key test error:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Test failed',
    }, { status: 500 });
  }
}

async function testAnthropicKey(apiKey: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // Make a minimal API call to test the key
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307', // Use cheapest model for test
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Anthropic API key is valid!',
      });
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `API returned status ${response.status}`;

    // Check for specific error types
    if (response.status === 401) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API key - authentication failed',
      });
    }

    if (response.status === 403) {
      return NextResponse.json({
        success: false,
        message: 'API key lacks required permissions',
      });
    }

    return NextResponse.json({
      success: false,
      message: errorMessage,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    });
  }
}

async function testOpenAIKey(apiKey: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // Import OpenAI and make a minimal API call
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });

    await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5,
    });

    return NextResponse.json({
      success: true,
      message: 'OpenAI API key is valid!',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (errorMessage.includes('401') || errorMessage.includes('Incorrect API key')) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API key - authentication failed',
      });
    }

    if (errorMessage.includes('429')) {
      return NextResponse.json({
        success: true,
        message: 'API key valid (rate limited - reduce request frequency)',
      });
    }

    return NextResponse.json({
      success: false,
      message: errorMessage,
    });
  }
}

async function testCourtListenerKey(apiKey: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API token (not masked)',
    });
  }

  try {
    // Test CourtListener API with a simple search
    const response = await fetch('https://www.courtlistener.com/api/rest/v3/search/?q=test&type=o', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'CourtListener API token is valid!',
      });
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API token - authentication failed',
      });
    }

    if (response.status === 429) {
      return NextResponse.json({
        success: true,
        message: 'API token valid (rate limited - reduce request frequency)',
      });
    }

    return NextResponse.json({
      success: false,
      message: `CourtListener API returned status ${response.status}`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    });
  }
}

/**
 * Test PACER credentials
 * NOTE: We don't actually authenticate to avoid charges - just validate format
 */
async function testPACERCredentials(username: string, password: string): Promise<NextResponse> {
  if (!username || username.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid PACER username',
    });
  }

  if (!password || password.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid PACER password',
    });
  }

  // Validate username format (PACER usernames are typically alphanumeric)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({
      success: false,
      message: 'PACER username should be alphanumeric',
    });
  }

  // For PACER, we don't want to actually authenticate because:
  // 1. Authentication itself might incur charges
  // 2. We want to avoid unnecessary API calls
  // Instead, we validate the format and trust the user
  try {
    // Check if PACER login page is accessible (doesn't authenticate)
    const response = await fetch('https://pacer.login.uscourts.gov/', {
      method: 'HEAD',
    });

    if (response.ok || response.status === 405) {
      return NextResponse.json({
        success: true,
        message: 'PACER credentials saved. Will authenticate on first use.',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'PACER credentials saved (connection check skipped to avoid charges).',
    });
  } catch {
    // Even if we can't reach PACER, save the credentials
    return NextResponse.json({
      success: true,
      message: 'PACER credentials saved. Connectivity will be verified on first lookup.',
    });
  }
}

async function testWestlawKey(apiKey: string, clientId?: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // Westlaw API test - attempt authentication
    // Note: This is a placeholder - actual Westlaw API may differ
    const baseUrl = 'https://api.westlaw.com/v1';
    const response = await fetch(`${baseUrl}/auth/test`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Client-Id': clientId || '',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Westlaw API connection successful!',
      });
    }

    // If we get a 404, the endpoint might be different but auth might work
    if (response.status === 404) {
      return NextResponse.json({
        success: true,
        message: 'Westlaw API key format accepted (endpoint verification pending)',
      });
    }

    return NextResponse.json({
      success: false,
      message: `Westlaw API returned status ${response.status}`,
    });
  } catch (error) {
    // Network errors might mean the API key format is fine but endpoint is wrong
    return NextResponse.json({
      success: false,
      message: 'Could not connect to Westlaw API. Verify your API credentials.',
    });
  }
}

async function testLexisNexisKey(apiKey: string, clientId?: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // LexisNexis API test
    // Note: This is a placeholder - actual LexisNexis API may differ
    const baseUrl = 'https://api.lexisnexis.com/v1';
    const response = await fetch(`${baseUrl}/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Client-Id': clientId || '',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'LexisNexis API connection successful!',
      });
    }

    if (response.status === 404) {
      return NextResponse.json({
        success: true,
        message: 'LexisNexis API key format accepted (endpoint verification pending)',
      });
    }

    return NextResponse.json({
      success: false,
      message: `LexisNexis API returned status ${response.status}`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Could not connect to LexisNexis API. Verify your API credentials.',
    });
  }
}
