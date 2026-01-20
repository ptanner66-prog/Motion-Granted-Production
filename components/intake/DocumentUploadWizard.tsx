/**
 * Document Upload Component for Wizard
 *
 * v6.3: Sixth step - upload supporting documents.
 */

'use client';

import React, { useCallback, useEffect } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { useIntakeForm } from '@/lib/intake/context';
import type { UploadedFile } from '@/lib/intake/types';
import { uploadDocument } from '@/lib/intake/api';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import {
  Upload,
  File,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export function DocumentUploadWizard() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();
  const files = formData.uploadedFiles || [];

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const isOverLimit = totalSize > MAX_TOTAL_SIZE;

  useEffect(() => {
    // Documents are optional but must not exceed limits
    setCanProceed(!isOverLimit);
  }, [isOverLimit, setCanProceed]);

  const addFile = (file: UploadedFile) => {
    updateFormData({
      uploadedFiles: [...files, file],
    });
  };

  const updateFile = (id: string, updates: Partial<UploadedFile>) => {
    updateFormData({
      uploadedFiles: files.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    });
  };

  const removeFile = (id: string) => {
    updateFormData({
      uploadedFiles: files.filter((f) => f.id !== id),
    });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Handle rejected files
      for (const { file, errors } of rejectedFiles) {
        const errorMsg = errors[0]?.code === 'file-too-large'
          ? `${file.name} exceeds 50MB limit`
          : `${file.name} is not an accepted file type`;
        console.error(errorMsg);
      }

      // Check total size
      const newTotal = acceptedFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize + newTotal > MAX_TOTAL_SIZE) {
        console.error('Total size would exceed 200MB limit');
        return;
      }

      // Add files and start uploads
      for (const file of acceptedFiles) {
        const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const newFile: UploadedFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadProgress: 0,
        };

        addFile(newFile);

        // Upload file
        try {
          const result = await uploadDocument(file);
          updateFile(fileId, {
            url: result.url,
            uploadProgress: 100,
          });
        } catch (error) {
          updateFile(fileId, {
            error: 'Upload failed',
            uploadProgress: undefined,
          });
        }
      }
    },
    [files, totalSize, addFile, updateFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Upload Documents</h2>
        <p className="mt-2 text-gray-600">
          Provide supporting documents for your motion
        </p>
      </div>

      {/* Dropzone */}
      <FormSection>
        <FieldLabel tooltip="Upload all relevant case documents">
          Supporting Documents
        </FieldLabel>
        <div
          {...getRootProps()}
          className={`
            mt-2 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }
          `}
        >
          <input {...getInputProps()} />
          <Upload
            className={`
              w-12 h-12 mx-auto mb-4
              ${isDragActive ? 'text-blue-500' : 'text-gray-400'}
            `}
          />
          {isDragActive ? (
            <p className="text-blue-600 font-medium">Drop files here...</p>
          ) : (
            <>
              <p className="text-gray-600">
                <span className="font-medium text-blue-600">Click to upload</span>
                {' '}or drag and drop
              </p>
              <p className="mt-1 text-sm text-gray-500">
                PDF, DOCX, or DOC (max 50MB per file, 200MB total)
              </p>
            </>
          )}
        </div>

        {/* Total size indicator */}
        {files.length > 0 && (
          <div
            className={`
              mt-2 text-sm flex items-center justify-end
              ${isOverLimit ? 'text-red-600' : 'text-gray-500'}
            `}
          >
            {isOverLimit && <AlertCircle className="w-4 h-4 mr-1" />}
            Total: {formatBytes(totalSize)} / {formatBytes(MAX_TOTAL_SIZE)}
          </div>
        )}
      </FormSection>

      {/* Uploaded files list */}
      {files.length > 0 && (
        <FormSection>
          <FieldLabel>Uploaded Files ({files.length})</FieldLabel>
          <div className="mt-2 space-y-2">
            {files.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                onRemove={() => removeFile(file.id)}
              />
            ))}
          </div>
        </FormSection>
      )}

      {/* OCR notice */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="ml-3 text-sm text-amber-800">
            <strong>Note:</strong> PDFs should be text-searchable for best
            results. Scanned documents may delay processing while we extract the
            text.
          </p>
        </div>
      </div>

      {/* Suggested documents */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Suggested Documents</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Complaint or petition</li>
          <li>• Answer or responsive pleading</li>
          <li>• Relevant prior motions and orders</li>
          <li>• Key exhibits or evidence</li>
          <li>• Opposing motion (if opposing)</li>
        </ul>
      </div>
    </div>
  );
}

interface FileItemProps {
  file: UploadedFile;
  onRemove: () => void;
}

function FileItem({ file, onRemove }: FileItemProps) {
  const isUploading =
    file.uploadProgress !== undefined && file.uploadProgress < 100;
  const isComplete = file.uploadProgress === 100;
  const hasError = !!file.error;

  const Icon = file.type === 'application/pdf' ? File : FileText;

  return (
    <div
      className={`
        flex items-center p-3 rounded-lg border
        ${hasError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}
      `}
    >
      <Icon
        className={`
          w-8 h-8 flex-shrink-0
          ${hasError ? 'text-red-400' : 'text-blue-500'}
        `}
      />

      <div className="ml-3 flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
        <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>

        {/* Progress bar */}
        {isUploading && (
          <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${file.uploadProgress}%` }}
            />
          </div>
        )}

        {/* Error message */}
        {hasError && (
          <p className="mt-1 text-xs text-red-600">{file.error}</p>
        )}
      </div>

      {/* Status indicator */}
      <div className="ml-3 flex-shrink-0">
        {isUploading && (
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        )}
        {isComplete && !hasError && (
          <CheckCircle className="w-5 h-5 text-green-500" />
        )}
        {hasError && <AlertCircle className="w-5 h-5 text-red-500" />}
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
        aria-label="Remove file"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default DocumentUploadWizard;
