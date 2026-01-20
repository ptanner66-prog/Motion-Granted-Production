/**
 * Real-time Module Index
 *
 * v6.3: Exports for real-time subscription services.
 */

export {
  WorkflowSubscriptionManager,
  getWorkflowSubscriptionManager,
  subscribeToOrderWorkflow,
  subscribeToWorkflows,
  type CheckpointType,
  type WorkflowUpdate,
  type RevisionUpdate,
  type PhaseChangeEvent,
  type CheckpointEvent,
  type WorkflowSubscriptionCallbacks,
} from './workflow-subscription';
