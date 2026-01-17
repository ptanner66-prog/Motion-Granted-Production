'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import {
  Workflow,
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  FileText,
  BookCheck,
  ChevronRight,
} from 'lucide-react'

interface WorkflowControlPanelProps {
  orderId: string
  orderNumber: string
  motionType: string
}

interface WorkflowStatus {
  exists: boolean
  workflowId?: string
  currentPhase?: number
  totalPhases?: number
  status?: string
  citationCount?: number
  qualityScore?: number
  currentPhaseName?: string
  currentPhaseStatus?: string
  requiresReview?: boolean
  estimatedMinutes?: number
}

export function WorkflowControlPanel({ orderId, orderNumber, motionType }: WorkflowControlPanelProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [workflow, setWorkflow] = useState<WorkflowStatus>({ exists: false })
  const [tablesExist, setTablesExist] = useState(true)

  // Fetch workflow status
  const fetchWorkflowStatus = async () => {
    try {
      const response = await fetch(`/api/workflow?orderId=${orderId}`)
      const data = await response.json()

      if (data.error?.includes('not exist') || data.error?.includes('42P01')) {
        setTablesExist(false)
        setLoading(false)
        return
      }

      setWorkflow(data)
      setTablesExist(true)
    } catch (error) {
      console.error('Failed to fetch workflow status:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkflowStatus()
  }, [orderId])

  // Start workflow
  const startWorkflow = async () => {
    setExecuting(true)
    try {
      const response = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          motionType,
          workflowPath: 'path_a', // Default to initiating motion
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start workflow')
      }

      toast({
        title: 'Workflow Started',
        description: 'The AI document production workflow has been initiated.',
      })

      await fetchWorkflowStatus()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start workflow',
        variant: 'destructive',
      })
    } finally {
      setExecuting(false)
    }
  }

  // Execute next phase
  const executePhase = async () => {
    if (!workflow.workflowId) return

    setExecuting(true)
    try {
      const response = await fetch(`/api/workflow/${workflow.workflowId}/execute`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute phase')
      }

      toast({
        title: data.requiresReview ? 'Phase Requires Review' : 'Phase Completed',
        description: data.requiresReview
          ? 'This phase requires manual review before continuing.'
          : `Phase ${workflow.currentPhase} completed successfully.`,
      })

      await fetchWorkflowStatus()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to execute phase',
        variant: 'destructive',
      })
    } finally {
      setExecuting(false)
    }
  }

  // Approve phase
  const approvePhase = async () => {
    if (!workflow.workflowId || !workflow.currentPhase) return

    setExecuting(true)
    try {
      const response = await fetch(`/api/workflow/${workflow.workflowId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseNumber: workflow.currentPhase,
          notes: 'Approved via admin panel',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve phase')
      }

      toast({
        title: 'Phase Approved',
        description: 'The workflow will continue to the next phase.',
      })

      await fetchWorkflowStatus()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve phase',
        variant: 'destructive',
      })
    } finally {
      setExecuting(false)
    }
  }

  // Not configured state
  if (!tablesExist) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-navy">
            <Workflow className="h-5 w-5 text-amber-500" />
            AI Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-navy">Setup Required</p>
              <p className="text-xs text-gray-500 mt-1">
                Run the workflow migration to enable AI document production.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Loading state
  if (loading) {
    return (
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-navy">
            <Workflow className="h-5 w-5 text-gray-400" />
            AI Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading workflow status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // No workflow started
  if (!workflow.exists) {
    return (
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-navy">
            <Workflow className="h-5 w-5 text-blue-500" />
            AI Workflow
          </CardTitle>
          <CardDescription>Automated document production</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-navy">Ready to Start</p>
                <p className="text-xs text-gray-600 mt-1">
                  Start the 9-phase AI workflow to automatically generate a {motionType} with verified citations.
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={startWorkflow}
            disabled={executing}
            className="w-full gap-2"
          >
            {executing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start AI Workflow
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Active workflow
  const progress = ((workflow.currentPhase || 1) / (workflow.totalPhases || 9)) * 100
  const isCompleted = workflow.status === 'completed'
  const isBlocked = workflow.status === 'blocked'
  const requiresReview = workflow.requiresReview || workflow.currentPhaseStatus === 'requires_review'

  return (
    <Card className={`border-gray-200 ${isBlocked ? 'border-red-200 bg-red-50/30' : requiresReview ? 'border-amber-200 bg-amber-50/30' : isCompleted ? 'border-green-200 bg-green-50/30' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-navy">
            <Workflow className={`h-5 w-5 ${isCompleted ? 'text-green-500' : isBlocked ? 'text-red-500' : 'text-blue-500'}`} />
            AI Workflow
          </CardTitle>
          <Badge
            variant={isCompleted ? 'default' : isBlocked ? 'destructive' : requiresReview ? 'warning' : 'secondary'}
          >
            {isCompleted ? 'Completed' : isBlocked ? 'Blocked' : requiresReview ? 'Needs Review' : 'In Progress'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              Phase {workflow.currentPhase} of {workflow.totalPhases}
            </span>
            <span className="text-sm font-semibold text-teal tabular-nums">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Current Phase */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {requiresReview ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : isBlocked ? (
              <AlertCircle className="h-4 w-4 text-red-500" />
            ) : (
              <Clock className="h-4 w-4 text-blue-500" />
            )}
            <span className="text-sm font-medium text-navy">
              {workflow.currentPhaseName || `Phase ${workflow.currentPhase}`}
            </span>
          </div>
          {workflow.estimatedMinutes && (
            <p className="text-xs text-gray-500">
              Est. {workflow.estimatedMinutes} min remaining
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <BookCheck className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Citations</p>
                <p className="text-sm font-semibold text-navy tabular-nums">
                  {workflow.citationCount || 0}
                </p>
              </div>
            </div>
          </div>
          {workflow.qualityScore !== undefined && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-gray-500">Quality</p>
                  <p className="text-sm font-semibold text-navy tabular-nums">
                    {Math.round(workflow.qualityScore * 100)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isCompleted && (
          <div className="space-y-2">
            {requiresReview ? (
              <Button
                onClick={approvePhase}
                disabled={executing}
                className="w-full gap-2"
                variant="default"
              >
                {executing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Approve & Continue
                  </>
                )}
              </Button>
            ) : !isBlocked ? (
              <Button
                onClick={executePhase}
                disabled={executing}
                className="w-full gap-2"
                variant="outline"
              >
                {executing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4" />
                    Execute Next Phase
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={executePhase}
                disabled={executing}
                className="w-full gap-2"
                variant="destructive"
              >
                {executing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Retry Phase
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-800">Workflow Complete</p>
                <p className="text-xs text-green-600">Document is ready for delivery</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
