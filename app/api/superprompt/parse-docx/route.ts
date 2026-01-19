import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'File must be a .docx file' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text using mammoth
    const result = await mammoth.extractRawText({ buffer });

    return NextResponse.json({
      text: result.value,
      messages: result.messages,
    });
  } catch (error) {
    console.error('Error parsing DOCX:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse DOCX file' },
      { status: 500 }
    );
  }
}
