export { EventMonitor } from './EventMonitor';
export type { CheckpointData } from './EventMonitor';
export { ContainerManager } from './ContainerManager';
export { NoosphereAgent } from './NoosphereAgent';
export type { ComputeDeliveredEvent, RequestStartedCallbackEvent, CommitmentSuccessCallbackEvent } from './NoosphereAgent';
export { SchedulerService } from './SchedulerService';

export * from './types';
export * from './utils';

// Re-export crypto utilities for convenience
export { WalletManager, KeystoreManager } from '@noosphere/crypto';
export type { NoosphereKeystore, PaymentWalletInfo, KeystoreInfo } from '@noosphere/crypto';

// Re-export registry utilities for convenience
export { RegistryManager } from '@noosphere/registry';
export type {
  ContainerMetadata as RegistryContainerMetadata,
  VerifierMetadata as RegistryVerifierMetadata,
  RegistryConfig,
} from '@noosphere/registry';

// Export config types
export type { NoosphereAgentConfig, ContainerConfig } from './types';
