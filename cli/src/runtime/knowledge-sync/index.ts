/**
 * Knowledge Sync Runtime Module
 *
 * Cross-workspace knowledge orchestration: transport, capture, hosted relay,
 * and pipeline node contracts.
 *
 * This module is additive — it does not modify existing kb-skill-bundle,
 * native-intelligence, or pipeline contracts.
 */

// Types
export type {
  WorkspaceRefKind,
  WorkspaceKnowledgeRef,
  KnowledgeSyncEnvelope,
  KnowledgeSyncItem,
  KnowledgeSyncEnvelopeVersion,
  CrossWorkspaceKitBundle,
  KnowledgeSyncResult,
  KnowledgeSyncItemResult,
  KnowledgeSyncStatus,
  KnowledgeCaptureInput,
  CaptureProposal,
  KnowledgeCaptureResult,
  WorkspaceKnowledgeSyncStatus,
  ResolvedLocalWorkspace,
  ExportOptions,
  ImportOptions,
  HostedRelayOptions,
  HostedRelayResult,
  CaptureAdvisorInput,
  CaptureAdvisorResult,
} from "./types.js";

// Transport
export {
  serializeEnvelope,
  deserializeEnvelope,
  verifyEnvelopeSignature,
  signEnvelope,
  filterNewItems,
  discoverLocalWorkspaces,
  writeEnvelopeFile,
  readEnvelopeFile,
  type SerializedEnvelope,
  type LocalWorkspaceDiscoveryResult,
} from "./transport.js";

// Hosted relay
export {
  relayEnvelopeToHosted,
  tryRelayEnvelopeToHosted,
  type HostedKnowledgeImportPayload,
  type HostedKnowledgeImportResponse,
} from "./hosted-relay.js";

// Post-run capture
export {
  captureAgentRunKnowledge,
  type LocalServerKnowledgeClient,
} from "./capture.js";

// Pipeline node contracts
export {
  KNOWLEDGE_EXPORT_NODE,
  KNOWLEDGE_IMPORT_NODE,
  KNOWLEDGE_CAPTURE_NODE,
  LOCAL_KNOWLEDGE_NODES,
  LOCAL_KNOWLEDGE_NODE_SLUGS,
} from "./pipeline-nodes.js";
