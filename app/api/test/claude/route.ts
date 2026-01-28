/**
 * Test endpoint for verifying Claude API connectivity
 *
 * GET /api/test/claude
 *
 * Tests that:
 * 1. API key is configured
 * 2. Claude API is reachable
 * 3. Response is generated successfully
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function GET() {
  const startTime = Date.now();

  try {
    console.log('[Claude Test] Starting API test...');

    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'ANTHROPIC_API_KEY environment variable is not set',
        apiKeyConfigured: false,
      }, { status: 500 });
    }

    if (apiKey.includes('xxxxx') || apiKey.length < 20) {
      return NextResponse.json({
        success: false,
        error: 'ANTHROPIC_API_KEY appears to be a placeholder or invalid',
        apiKeyConfigured: false,
        apiKeyPreview: `${apiKey.substring(0, 10)}...`,
      }, { status: 500 });
    }

    console.log('[Claude Test] API key found, length:', apiKey.length);

    // Create Anthropic client
    const client = new Anthropic({ apiKey });

    // Make a simple test call
    console.log('[Claude Test] Calling Claude API...');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: 'Please respond with exactly: "API test successful"'
      }]
    });

    const duration = Date.now() - startTime;

    // Extract response text
    const textContent = response.content.find(c => c.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    console.log('[Claude Test] Success! Duration:', duration, 'ms');
    console.log('[Claude Test] Response:', responseText);

    return NextResponse.json({
      success: true,
      apiKeyConfigured: true,
      duration: `${duration}ms`,
      model: response.model,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200),
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      message: 'Claude API is working correctly!',
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Claude Test] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      duration: `${duration}ms`,
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
