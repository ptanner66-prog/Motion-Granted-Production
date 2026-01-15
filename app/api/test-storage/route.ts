import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tests: {}
  }

  try {
    const supabase = await createClient()

    // Test 1: Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    results.tests = {
      ...results.tests as object,
      auth: {
        success: !!user,
        userId: user?.id,
        error: authError?.message
      }
    }

    if (!user) {
      results.error = 'Not authenticated - please log in first'
      return NextResponse.json(results)
    }

    // Test 2: Check if documents table exists and we can query it
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .limit(1)

    results.tests = {
      ...results.tests as object,
      documentsTable: {
        success: !docsError,
        error: docsError?.message
      }
    }

    // Test 3: Try to upload a test file to storage
    const testContent = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    const testPath = `test/${user.id}/test-${Date.now()}.txt`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(testPath, testContent, {
        contentType: 'text/plain',
        upsert: true
      })

    results.tests = {
      ...results.tests as object,
      storageUpload: {
        success: !uploadError,
        path: uploadData?.path,
        error: uploadError?.message,
        fullError: uploadError
      }
    }

    // Test 4: If upload worked, try to get the URL
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(testPath)

      results.tests = {
        ...results.tests as object,
        publicUrl: {
          success: true,
          url: urlData?.publicUrl
        }
      }

      // Clean up test file
      await supabase.storage.from('documents').remove([testPath])
    }

    // Test 5: Try to insert into documents table (then delete)
    const { data: insertData, error: insertError } = await supabase
      .from('documents')
      .insert({
        order_id: '00000000-0000-0000-0000-000000000000', // Fake UUID
        file_name: 'test.txt',
        file_type: 'text/plain',
        file_size: 5,
        file_url: 'test/path.txt',
        document_type: 'other',
        uploaded_by: user.id,
        is_deliverable: false
      })
      .select('id')
      .single()

    if (insertError) {
      results.tests = {
        ...results.tests as object,
        databaseInsert: {
          success: false,
          error: insertError.message,
          code: insertError.code,
          hint: insertError.hint
        }
      }
    } else {
      // Clean up
      await supabase.from('documents').delete().eq('id', insertData.id)
      results.tests = {
        ...results.tests as object,
        databaseInsert: {
          success: true,
          message: 'Insert and delete worked'
        }
      }
    }

    // Summary
    const tests = results.tests as Record<string, { success: boolean }>
    const allPassed = Object.values(tests).every(t => t.success)
    results.allPassed = allPassed
    results.summary = allPassed
      ? 'All tests passed! Document uploads should work.'
      : 'Some tests failed - check the errors above'

  } catch (error) {
    results.error = error instanceof Error ? error.message : 'Unknown error'
  }

  return NextResponse.json(results, { status: 200 })
}
