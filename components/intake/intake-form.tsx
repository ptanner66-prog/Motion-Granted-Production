'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDropzone, FileRejection } from 'react-dropzone'
import { differenceInDays, format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { CharacterCounter } from './character-counter'
import {
  MOTION_TYPE_OPTIONS,
  JURISDICTION_OPTIONS,
  COURT_OPTIONS,
  PARTY_REPRESENTED_OPTIONS,
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  formatBytes,
  getMotionTier,
} from '@/config/intake-form'
import {
  Scale,
  FileText,
  Upload,
  X,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Folder,
  CheckCircle,
} from 'lucide-react'

// File with metadata
interface UploadedFile {
  id: string
  file: File
  name: string
  size: number
  type: string
  progress: number
  uploading: boolean
  error?: string
}

// Form validation schema
const intakeSchema = z.object({
  motion_type: z.string().min(1, 'Please select a motion type'),
  motion_type_other: z.string().optional(),
  filing_deadline: z.string().refine(
    (val) => {
      if (!val) return false
      const date = new Date(val)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return date >= today
    },
    'Filing deadline must be today or a future date'
  ),
  jurisdiction: z.string().min(1, 'Please select the jurisdiction'),
  court: z.string().min(1, 'Please select the court'),
  court_other: z.string().optional(),
  case_number: z.string().optional(),
  case_not_filed: z.boolean(),
  party_represented: z.string().min(1, 'Please select which party you represent'),
  party_represented_other: z.string().optional(),
  plaintiff_names: z.string().min(2, 'Please provide the plaintiff name(s)'),
  defendant_names: z.string().min(2, 'Please provide the defendant name(s)'),
  judge_name: z.string().optional(),
  statement_of_facts: z.string().min(200, 'Please provide more detail (minimum 200 characters)'),
  procedural_history: z.string().min(100, 'Procedural history requires minimum 100 characters'),
  drafting_instructions: z.string().min(50, 'Drafting instructions requires minimum 50 characters'),
}).refine(
  (data) => data.case_not_filed || (data.case_number && data.case_number.length > 0),
  { message: 'Please provide the case number', path: ['case_number'] }
).refine(
  (data) => data.motion_type !== 'Other (Custom)' || (data.motion_type_other && data.motion_type_other.length > 0),
  { message: 'Please specify the motion type', path: ['motion_type_other'] }
).refine(
  (data) => !data.court?.includes('Other') || (data.court_other && data.court_other.length > 0),
  { message: 'Please specify the court', path: ['court_other'] }
).refine(
  (data) => data.party_represented !== 'Other (specify)' || (data.party_represented_other && data.party_represented_other.length > 0),
  { message: 'Please specify the party', path: ['party_represented_other'] }
)

type IntakeFormData = z.infer<typeof intakeSchema>

export function IntakeForm() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<IntakeFormData>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      motion_type: '',
      motion_type_other: '',
      filing_deadline: '',
      jurisdiction: '',
      court: '',
      court_other: '',
      case_number: '',
      case_not_filed: false,
      party_represented: '',
      party_represented_other: '',
      plaintiff_names: '',
      defendant_names: '',
      judge_name: '',
      statement_of_facts: '',
      procedural_history: '',
      drafting_instructions: '',
    },
    mode: 'onBlur',
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form

  const watchMotionType = watch('motion_type')
  const watchJurisdiction = watch('jurisdiction')
  const watchCourt = watch('court')
  const watchCaseNotFiled = watch('case_not_filed')
  const watchPartyRepresented = watch('party_represented')
  const watchFilingDeadline = watch('filing_deadline')
  const watchStatementOfFacts = watch('statement_of_facts')
  const watchProceduralHistory = watch('procedural_history')
  const watchDraftingInstructions = watch('drafting_instructions')

  // Get courts for selected jurisdiction
  const availableCourts = watchJurisdiction ? COURT_OPTIONS[watchJurisdiction] || [] : []

  // Reset court when jurisdiction changes
  const handleJurisdictionChange = (value: string) => {
    setValue('jurisdiction', value)
    setValue('court', '')
    setValue('court_other', '')
  }

  // Calculate deadline warning
  const getDeadlineWarning = () => {
    if (!watchFilingDeadline) return null
    const deadline = new Date(watchFilingDeadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntil = differenceInDays(deadline, today)

    if (daysUntil < 1) {
      return { level: 'critical', message: 'CRITICAL: Less than 24 hours to deadline' }
    }
    if (daysUntil < 2) {
      return { level: 'urgent', message: 'Urgent deadline - expedited processing required' }
    }
    return null
  }

  const deadlineWarning = getDeadlineWarning()

  // Format deadline display
  const getDeadlineDisplay = () => {
    if (!watchFilingDeadline) return null
    const deadline = new Date(watchFilingDeadline)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntil = differenceInDays(deadline, today)
    return `${format(deadline, 'EEEE, MMMM d, yyyy')} (${daysUntil} day${daysUntil === 1 ? '' : 's'} from today)`
  }

  // File drop handling
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    // Handle rejected files
    rejectedFiles.forEach(({ file, errors }) => {
      errors.forEach(err => {
        if (err.code === 'file-too-large') {
          toast({
            title: 'File too large',
            description: `${file.name} exceeds the 50MB limit.`,
            variant: 'destructive',
          })
        } else if (err.code === 'file-invalid-type') {
          toast({
            title: 'Invalid file type',
            description: `${file.name} is not an accepted file type. Please upload PDF, DOCX, DOC, TXT, or RTF.`,
            variant: 'destructive',
          })
        }
      })
    })

    // Check total size
    const currentTotal = files.reduce((acc, f) => acc + f.size, 0)
    const newTotal = acceptedFiles.reduce((acc, f) => acc + f.size, 0)
    if (currentTotal + newTotal > MAX_TOTAL_SIZE) {
      toast({
        title: 'Total size exceeded',
        description: 'Total upload size cannot exceed 200MB.',
        variant: 'destructive',
      })
      return
    }

    // Add accepted files
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      uploading: false,
    }))

    setFiles(prev => [...prev, ...newFiles])
  }, [files, toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
  })

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const totalFileSize = files.reduce((acc, f) => acc + f.size, 0)

  // Upload files to storage
  const uploadFiles = async (orderId: string): Promise<Array<{ filename: string; file_type: string; file_size_bytes: number; upload_path: string }>> => {
    const uploadedDocs: Array<{ filename: string; file_type: string; file_size_bytes: number; upload_path: string }> = []

    for (let i = 0; i < files.length; i++) {
      const fileData = files[i]
      const filePath = `orders/${orderId}/${Date.now()}-${fileData.file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

      setFiles(prev => prev.map(f =>
        f.id === fileData.id ? { ...f, uploading: true, progress: 0 } : f
      ))

      try {
        const { data, error } = await supabase.storage
          .from('documents')
          .upload(filePath, fileData.file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (error) throw error

        setFiles(prev => prev.map(f =>
          f.id === fileData.id ? { ...f, uploading: false, progress: 100 } : f
        ))

        uploadedDocs.push({
          filename: fileData.name,
          file_type: fileData.type,
          file_size_bytes: fileData.size,
          upload_path: data.path,
        })
      } catch (err) {
        console.error('Upload error:', err)
        setFiles(prev => prev.map(f =>
          f.id === fileData.id ? { ...f, uploading: false, error: 'Upload failed' } : f
        ))
      }
    }

    return uploadedDocs
  }

  // Submit form
  const onSubmit = async (data: IntakeFormData) => {
    // Validate at least one file
    if (files.length === 0) {
      toast({
        title: 'Documents required',
        description: 'Please upload at least one document.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      // Determine motion tier for pricing
      const motionTier = getMotionTier(data.motion_type)

      // Create case caption from party names
      const caseCaption = `${data.plaintiff_names} v. ${data.defendant_names}`

      // Prepare parties data
      const parties = [
        { name: data.plaintiff_names, role: 'Plaintiff' },
        { name: data.defendant_names, role: 'Defendant' },
      ]

      // Prepare order data
      const orderData = {
        motion_type: data.motion_type === 'Other (Custom)' && data.motion_type_other
          ? data.motion_type_other
          : data.motion_type,
        motion_tier: motionTier,
        base_price: 0, // Will be quoted by admin
        turnaround: 'standard',
        rush_surcharge: 0,
        total_price: 0, // Will be quoted by admin
        filing_deadline: data.filing_deadline,
        jurisdiction: data.jurisdiction,
        court_division: data.court?.includes('Other') && data.court_other
          ? data.court_other
          : data.court,
        case_number: data.case_not_filed ? 'Not Yet Filed' : data.case_number,
        case_caption: caseCaption,
        statement_of_facts: data.statement_of_facts,
        procedural_history: data.procedural_history,
        instructions: data.drafting_instructions,
        related_entities: data.judge_name ? `Judge: ${data.judge_name}` : null,
        parties,
        documents: [],
      }

      // Submit order
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit order')
      }

      const orderId = result.order?.id

      if (!orderId) {
        throw new Error('Order created but no ID returned')
      }

      // Upload documents
      const uploadedDocs = await uploadFiles(orderId)

      // Save document records to database
      for (const doc of uploadedDocs) {
        await supabase.from('documents').insert({
          order_id: orderId,
          file_name: doc.filename,
          file_type: doc.file_type,
          file_size: doc.file_size_bytes,
          file_url: doc.upload_path,
          document_type: 'supporting',
          uploaded_by: user.id,
          is_deliverable: false,
        })
      }

      toast({
        title: 'Matter submitted successfully!',
        description: 'You will receive a confirmation email shortly.',
      })

      // Redirect to success or dashboard
      router.push(`/orders/${orderId}`)
      router.refresh()

    } catch (error) {
      console.error('Submission error:', error)
      toast({
        title: 'Submission failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Section 1: Motion & Case Details */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-navy/5 to-transparent border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/10">
              <Scale className="h-5 w-5 text-navy" />
            </div>
            <div>
              <CardTitle className="text-lg text-navy">Motion & Case Details</CardTitle>
              <CardDescription>Basic information about your motion and case</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Motion Type */}
          <div className="space-y-2">
            <Label htmlFor="motion_type">Motion Type *</Label>
            <select
              id="motion_type"
              {...register('motion_type')}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">-- Select Motion Type --</option>
              {Object.entries(MOTION_TYPE_OPTIONS).map(([group, motions]) => (
                <optgroup key={group} label={group}>
                  {motions.map(motion => (
                    <option key={motion} value={motion}>{motion}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.motion_type && (
              <p className="text-sm text-red-500">{errors.motion_type.message}</p>
            )}

            {watchMotionType === 'Other (Custom)' && (
              <Input
                placeholder="Please specify the motion type"
                {...register('motion_type_other')}
                className="mt-2"
              />
            )}

            {watchMotionType?.includes('Opposition') && (
              <Alert className="mt-2 border-orange-200 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  Please ensure you upload the motion you are opposing
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Filing Deadline */}
          <div className="space-y-2">
            <Label htmlFor="filing_deadline">Filing Deadline *</Label>
            <Input
              id="filing_deadline"
              type="date"
              {...register('filing_deadline')}
              min={new Date().toISOString().split('T')[0]}
            />
            {watchFilingDeadline && (
              <p className="text-sm text-gray-600">{getDeadlineDisplay()}</p>
            )}
            {deadlineWarning && (
              <Alert className={deadlineWarning.level === 'critical'
                ? 'border-red-200 bg-red-50'
                : 'border-orange-200 bg-orange-50'
              }>
                <AlertTriangle className={`h-4 w-4 ${
                  deadlineWarning.level === 'critical' ? 'text-red-600' : 'text-orange-600'
                }`} />
                <AlertDescription className={
                  deadlineWarning.level === 'critical' ? 'text-red-800' : 'text-orange-800'
                }>
                  {deadlineWarning.message}
                </AlertDescription>
              </Alert>
            )}
            {errors.filing_deadline && (
              <p className="text-sm text-red-500">{errors.filing_deadline.message}</p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Jurisdiction */}
            <div className="space-y-2">
              <Label htmlFor="jurisdiction">Jurisdiction *</Label>
              <select
                id="jurisdiction"
                value={watchJurisdiction}
                onChange={(e) => handleJurisdictionChange(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">-- Select Jurisdiction --</option>
                {JURISDICTION_OPTIONS.map(jur => (
                  <option key={jur} value={jur}>{jur}</option>
                ))}
              </select>
              {errors.jurisdiction && (
                <p className="text-sm text-red-500">{errors.jurisdiction.message}</p>
              )}
            </div>

            {/* Court */}
            <div className="space-y-2">
              <Label htmlFor="court">Court *</Label>
              <select
                id="court"
                {...register('court')}
                disabled={!watchJurisdiction}
                className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Court --</option>
                {availableCourts.map(court => (
                  <option key={court} value={court}>{court}</option>
                ))}
              </select>
              {errors.court && (
                <p className="text-sm text-red-500">{errors.court.message}</p>
              )}

              {watchCourt?.includes('Other') && (
                <Input
                  placeholder="Please specify the court"
                  {...register('court_other')}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          {/* Case Number */}
          <div className="space-y-2">
            <Label htmlFor="case_number">Case Number *</Label>
            <Input
              id="case_number"
              placeholder="e.g., 2:24-cv-01234 or BC123456"
              {...register('case_number')}
              disabled={watchCaseNotFiled}
              className={watchCaseNotFiled ? 'bg-gray-100' : ''}
            />
            <div className="flex items-center gap-2 mt-2">
              <Checkbox
                id="case_not_filed"
                checked={watchCaseNotFiled}
                onCheckedChange={(checked) => {
                  setValue('case_not_filed', !!checked)
                  if (checked) setValue('case_number', '')
                }}
              />
              <Label htmlFor="case_not_filed" className="text-sm font-normal cursor-pointer">
                Case not yet filed
              </Label>
            </div>
            {errors.case_number && (
              <p className="text-sm text-red-500">{errors.case_number.message}</p>
            )}
          </div>

          {/* Party Represented */}
          <div className="space-y-2">
            <Label htmlFor="party_represented">Party Represented *</Label>
            <select
              id="party_represented"
              {...register('party_represented')}
              className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">-- Select Party --</option>
              {PARTY_REPRESENTED_OPTIONS.map(party => (
                <option key={party} value={party}>{party}</option>
              ))}
            </select>
            {errors.party_represented && (
              <p className="text-sm text-red-500">{errors.party_represented.message}</p>
            )}

            {watchPartyRepresented === 'Other (specify)' && (
              <Input
                placeholder="Please specify"
                {...register('party_represented_other')}
                className="mt-2"
              />
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Plaintiff Names */}
            <div className="space-y-2">
              <Label htmlFor="plaintiff_names">Plaintiff Name(s) *</Label>
              <Input
                id="plaintiff_names"
                placeholder="e.g., John Smith or Smith Industries, LLC"
                {...register('plaintiff_names')}
              />
              <p className="text-xs text-gray-500">For multiple plaintiffs, separate with semicolons</p>
              {errors.plaintiff_names && (
                <p className="text-sm text-red-500">{errors.plaintiff_names.message}</p>
              )}
            </div>

            {/* Defendant Names */}
            <div className="space-y-2">
              <Label htmlFor="defendant_names">Defendant Name(s) *</Label>
              <Input
                id="defendant_names"
                placeholder="e.g., Jane Doe or ABC Corporation"
                {...register('defendant_names')}
              />
              <p className="text-xs text-gray-500">For multiple defendants, separate with semicolons</p>
              {errors.defendant_names && (
                <p className="text-sm text-red-500">{errors.defendant_names.message}</p>
              )}
            </div>
          </div>

          {/* Judge Name */}
          <div className="space-y-2">
            <Label htmlFor="judge_name">Judge Name (optional)</Label>
            <Input
              id="judge_name"
              placeholder="e.g., Hon. Jane Smith (if known)"
              {...register('judge_name')}
            />
            <p className="text-xs text-gray-500">Leave blank if unknown or not yet assigned</p>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Case Narrative */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-teal/5 to-transparent border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10">
              <FileText className="h-5 w-5 text-teal" />
            </div>
            <div>
              <CardTitle className="text-lg text-navy">Case Narrative</CardTitle>
              <CardDescription>Provide the facts and context for your motion</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Statement of Facts */}
          <div className="space-y-2">
            <Label htmlFor="statement_of_facts">Statement of Facts *</Label>
            <Textarea
              id="statement_of_facts"
              placeholder="Describe the key facts relevant to this motion. Include dates, parties involved, and specific events. The more detail you provide, the stronger the motion we can prepare."
              {...register('statement_of_facts')}
              className="min-h-[150px] resize-y"
            />
            <CharacterCounter
              current={watchStatementOfFacts?.length || 0}
              minimum={200}
            />
            {errors.statement_of_facts && (
              <p className="text-sm text-red-500">{errors.statement_of_facts.message}</p>
            )}
          </div>

          {/* Procedural History */}
          <div className="space-y-2">
            <Label htmlFor="procedural_history">Procedural History *</Label>
            <Textarea
              id="procedural_history"
              placeholder="Summarize the litigation history: when the case was filed, what motions have been filed, any relevant court rulings, current status."
              {...register('procedural_history')}
              className="min-h-[100px] resize-y"
            />
            <CharacterCounter
              current={watchProceduralHistory?.length || 0}
              minimum={100}
            />
            {errors.procedural_history && (
              <p className="text-sm text-red-500">{errors.procedural_history.message}</p>
            )}
          </div>

          {/* Drafting Instructions */}
          <div className="space-y-2">
            <Label htmlFor="drafting_instructions">Drafting Instructions *</Label>
            <Textarea
              id="drafting_instructions"
              placeholder="Provide any specific instructions for drafting: arguments to emphasize, arguments to avoid, tone preferences, page limits, any other guidance."
              {...register('drafting_instructions')}
              className="min-h-[100px] resize-y"
            />
            <CharacterCounter
              current={watchDraftingInstructions?.length || 0}
              minimum={50}
            />
            {errors.drafting_instructions && (
              <p className="text-sm text-red-500">{errors.drafting_instructions.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Document Upload */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-transparent border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
              <Upload className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-lg text-navy">Document Upload</CardTitle>
              <CardDescription>Upload supporting documents for your motion</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-teal bg-teal/5'
                : 'border-gray-300 hover:border-teal hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <Folder className={`h-12 w-12 mx-auto mb-3 ${
              isDragActive ? 'text-teal' : 'text-gray-400'
            }`} />
            <p className="font-medium text-navy">
              {isDragActive ? 'Drop files here' : 'DRAG & DROP FILES HERE'}
            </p>
            <p className="text-sm text-gray-500 mt-1">or click to browse</p>
            <p className="text-xs text-gray-400 mt-3">
              Accepted: PDF, DOCX, DOC, TXT, RTF | Max size: 50MB per file
            </p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-3">
              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-navy text-sm truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {file.uploading && (
                      <Loader2 className="h-4 w-4 animate-spin text-teal" />
                    )}
                    {file.progress === 100 && !file.error && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {file.error && (
                      <span className="text-xs text-red-500">{file.error}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-sm text-gray-600">
                {files.length} file{files.length === 1 ? '' : 's'} ({formatBytes(totalFileSize)} total)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-14 text-lg btn-premium"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          'SUBMIT MATTER'
        )}
      </Button>
    </form>
  )
}
