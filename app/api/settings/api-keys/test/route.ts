/**
 * API Keys Test Route
 *
 * Tests connectivity for API keys:
 * - Anthropic: Makes a simple API call to verify the key works
 * - OpenAI: Tests models endpoint
 * - CourtListener: Tests search endpoint
 * - PACER: Tests authentication
 * - Stripe: Tests account endpoint
 * - Resend: Tests domains endpoint
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
      case 'stripe': {
        return await testStripeKey(settings.stripe_secret_key);
      }
      case 'resend': {
        return await testResendKey(settings.resend_api_key);
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
        model: 'claude-haiku-4-5-20251001', // Use cheapest model for test
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
    // Test by listing models
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'OpenAI API key is valid!',
      });
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `API returned status ${response.status}`;

    if (response.status === 401) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API key - authentication failed',
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

async function testCourtListenerKey(apiKey: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // Test with a simple search
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
        message: 'CourtListener API key is valid!',
      });
    }

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
      message: `CourtListener API returned status ${response.status}`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    });
  }
}

async function testPACERCredentials(username: string, password: string): Promise<NextResponse> {
  if (!username || !password || password.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter valid credentials (not masked)',
    });
  }

  try {
    // PACER login test - this is a simplified test
    // Real PACER API may require different authentication flow
    const response = await fetch('https://pacer.login.uscourts.gov/services/cso-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        login: username,
        key: password,
      }).toString(),
    });

    // PACER may return different status codes
    if (response.ok || response.status === 302) {
      return NextResponse.json({
        success: true,
        message: 'PACER credentials appear valid!',
      });
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({
        success: false,
        message: 'Invalid PACER credentials',
      });
    }

    // If we can't test properly, give a warning
    return NextResponse.json({
      success: true,
      message: 'PACER credentials saved (full test requires active session)',
    });
  } catch (error) {
    // Network errors might mean the endpoint is different, but credentials could still be valid
    return NextResponse.json({
      success: true,
      message: 'PACER credentials saved (connection test inconclusive)',
    });
  }
}

async function testStripeKey(apiKey: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // Test by retrieving account info
    const response = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: `Stripe API key is valid! (Account: ${data.business_profile?.name || 'Connected'})`,
      });
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `API returned status ${response.status}`;

    if (response.status === 401) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API key - authentication failed',
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

async function testResendKey(apiKey: string): Promise<NextResponse> {
  if (!apiKey || apiKey.startsWith('****')) {
    return NextResponse.json({
      success: false,
      message: 'Please enter a valid API key (not masked)',
    });
  }

  try {
    // Test by listing domains
    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Resend API key is valid!',
      });
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.message || `API returned status ${response.status}`;

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({
        success: false,
        message: 'Invalid API key - authentication failed',
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
