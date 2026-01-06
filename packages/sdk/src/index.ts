/**
 * Noosphere SDK
 *
 * Unified entry point for all Noosphere packages.
 *
 * @example
 * ```typescript
 * import { NoosphereAgent, Coordinator, WalletManager } from '@noosphere/sdk';
 * ```
 */

// Re-export from agent-core
export * from '@noosphere/agent-core';

// Re-export from contracts (with namespace to avoid conflicts)
export * as contracts from '@noosphere/contracts';

// Re-export from crypto
export * as crypto from '@noosphere/crypto';

// Re-export from registry
export * as registry from '@noosphere/registry';
