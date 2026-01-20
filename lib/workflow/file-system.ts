/**
 * Workflow File System
 *
 * Provides file system operations for Claude's workflow via Supabase.
 * This allows Claude to read/write files as part of the HANDOFF workflow.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Admin client for file operations (bypasses RLS)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

export interface WorkflowFile {
  id: string;
  order_id: string;
  file_path: string;
  file_name: string;
  content: string;
  file_type: 'handoff' | 'motion' | 'declaration' | 'citation_report' | 'research_memo' | 'other';
  created_at: string;
  updated_at: string;
}

export interface FileOperationResult {
  success: boolean;
  data?: WorkflowFile | WorkflowFile[] | string;
  error?: string;
}

/**
 * Write a file to the workflow file system
 */
export async function writeFile(
  orderId: string,
  filePath: string,
  content: string
): Promise<FileOperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Extract filename from path
    const fileName = filePath.split('/').pop() || filePath;

    // Determine file type from filename
    let fileType: WorkflowFile['file_type'] = 'other';
    if (fileName.toLowerCase().includes('handoff')) {
      fileType = 'handoff';
    } else if (fileName.toLowerCase().includes('motion') || fileName.toLowerCase().includes('opposition')) {
      fileType = 'motion';
    } else if (fileName.toLowerCase().includes('declaration') || fileName.toLowerCase().includes('affidavit')) {
      fileType = 'declaration';
    } else if (fileName.toLowerCase().includes('citation')) {
      fileType = 'citation_report';
    } else if (fileName.toLowerCase().includes('research') || fileName.toLowerCase().includes('memo')) {
      fileType = 'research_memo';
    }

    // Check if file already exists
    const { data: existing } = await supabase
      .from('workflow_files')
      .select('id')
      .eq('order_id', orderId)
      .eq('file_path', filePath)
      .single();

    if (existing) {
      // Update existing file
      const { data, error } = await supabase
        .from('workflow_files')
        .update({
          content,
          file_type: fileType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } else {
      // Create new file
      const { data, error } = await supabase
        .from('workflow_files')
        .insert({
          order_id: orderId,
          file_path: filePath,
          file_name: fileName,
          content,
          file_type: fileType,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to write file',
    };
  }
}

/**
 * Read a file from the workflow file system
 */
export async function readFile(
  orderId: string,
  filePath: string
): Promise<FileOperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('workflow_files')
      .select('*')
      .eq('order_id', orderId)
      .eq('file_path', filePath)
      .single();

    if (error) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    };
  }
}

/**
 * List files in the workflow file system for an order
 */
export async function listFiles(
  orderId: string,
  directory?: string
): Promise<FileOperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    let query = supabase
      .from('workflow_files')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (directory) {
      query = query.ilike('file_path', `${directory}%`);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list files',
    };
  }
}

/**
 * Find the most recent handoff file for an order
 */
export async function findLatestHandoff(orderId: string): Promise<FileOperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('workflow_files')
      .select('*')
      .eq('order_id', orderId)
      .eq('file_type', 'handoff')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return { success: false, error: 'No handoff file found' };
    }
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find handoff',
    };
  }
}

/**
 * Delete a file from the workflow file system
 */
export async function deleteFile(
  orderId: string,
  filePath: string
): Promise<FileOperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { error } = await supabase
      .from('workflow_files')
      .delete()
      .eq('order_id', orderId)
      .eq('file_path', filePath);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: `Deleted: ${filePath}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete file',
    };
  }
}

/**
 * Parse file operation commands from Claude's response
 * Returns the operations to execute and the cleaned response
 */
export interface FileOperation {
  type: 'write' | 'read' | 'list' | 'find_handoff';
  path?: string;
  content?: string;
}

export function parseFileOperations(response: string): {
  operations: FileOperation[];
  cleanedResponse: string;
} {
  const operations: FileOperation[] = [];
  let cleanedResponse = response;

  // Pattern for write operations: <file_write path="/path/to/file.md">content</file_write>
  const writePattern = /<file_write\s+path="([^"]+)">([\s\S]*?)<\/file_write>/g;
  let match;
  while ((match = writePattern.exec(response)) !== null) {
    operations.push({
      type: 'write',
      path: match[1],
      content: match[2].trim(),
    });
    cleanedResponse = cleanedResponse.replace(match[0], `[FILE WRITTEN: ${match[1]}]`);
  }

  // Pattern for read operations: <file_read path="/path/to/file.md" />
  const readPattern = /<file_read\s+path="([^"]+)"\s*\/>/g;
  while ((match = readPattern.exec(response)) !== null) {
    operations.push({
      type: 'read',
      path: match[1],
    });
    cleanedResponse = cleanedResponse.replace(match[0], `[READING FILE: ${match[1]}]`);
  }

  // Pattern for list operations: <file_list directory="/path/" />
  const listPattern = /<file_list\s+(?:directory="([^"]*)")?\s*\/>/g;
  while ((match = listPattern.exec(response)) !== null) {
    operations.push({
      type: 'list',
      path: match[1] || undefined,
    });
    cleanedResponse = cleanedResponse.replace(match[0], '[LISTING FILES]');
  }

  // Pattern for find latest handoff: <find_handoff />
  const handoffPattern = /<find_handoff\s*\/>/g;
  while ((match = handoffPattern.exec(response)) !== null) {
    operations.push({
      type: 'find_handoff',
    });
    cleanedResponse = cleanedResponse.replace(match[0], '[FINDING LATEST HANDOFF]');
  }

  return { operations, cleanedResponse };
}

/**
 * Execute file operations and return results
 */
export async function executeFileOperations(
  orderId: string,
  operations: FileOperation[]
): Promise<string[]> {
  const results: string[] = [];

  for (const op of operations) {
    switch (op.type) {
      case 'write': {
        if (op.path && op.content) {
          const result = await writeFile(orderId, op.path, op.content);
          if (result.success) {
            results.push(`[FILE SYSTEM] Successfully wrote: ${op.path}`);
          } else {
            results.push(`[FILE SYSTEM ERROR] Failed to write ${op.path}: ${result.error}`);
          }
        }
        break;
      }
      case 'read': {
        if (op.path) {
          const result = await readFile(orderId, op.path);
          if (result.success && result.data) {
            const file = result.data as WorkflowFile;
            results.push(`[FILE SYSTEM] Contents of ${op.path}:\n${file.content}`);
          } else {
            results.push(`[FILE SYSTEM ERROR] ${result.error}`);
          }
        }
        break;
      }
      case 'list': {
        const result = await listFiles(orderId, op.path);
        if (result.success && result.data) {
          const files = result.data as WorkflowFile[];
          if (files.length === 0) {
            results.push('[FILE SYSTEM] No files found.');
          } else {
            const fileList = files.map(f => `  - ${f.file_path} (${f.file_type}, updated: ${f.updated_at})`).join('\n');
            results.push(`[FILE SYSTEM] Files:\n${fileList}`);
          }
        } else {
          results.push(`[FILE SYSTEM ERROR] ${result.error}`);
        }
        break;
      }
      case 'find_handoff': {
        const result = await findLatestHandoff(orderId);
        if (result.success && result.data) {
          const file = result.data as WorkflowFile;
          results.push(`[FILE SYSTEM] Latest handoff: ${file.file_path}\n\nContents:\n${file.content}`);
        } else {
          results.push('[FILE SYSTEM] No handoff file found. This appears to be a new matter.');
        }
        break;
      }
    }
  }

  return results;
}

/**
 * Get all files for an order (for downloading/exporting)
 */
export async function getOrderFiles(orderId: string): Promise<FileOperationResult> {
  return listFiles(orderId);
}

/**
 * Get the latest motion draft for an order
 */
export async function getLatestMotionDraft(orderId: string): Promise<FileOperationResult> {
  const supabase = getAdminClient();
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('workflow_files')
      .select('*')
      .eq('order_id', orderId)
      .eq('file_type', 'motion')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return { success: false, error: 'No motion draft found' };
    }
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get motion draft',
    };
  }
}
