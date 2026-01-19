import { describe, it, expect } from 'vitest';
import * as sdk from '../src/index';

describe('@noosphere/sdk exports', () => {
  describe('namespaced exports', () => {
    it('should export contracts namespace', () => {
      expect(sdk.contracts).toBeDefined();
      expect(sdk.contracts.RouterContract).toBeDefined();
      expect(sdk.contracts.CoordinatorContract).toBeDefined();
    });

    it('should export crypto namespace', () => {
      expect(sdk.crypto).toBeDefined();
      expect(sdk.crypto.WalletManager).toBeDefined();
      expect(sdk.crypto.KeystoreManager).toBeDefined();
    });

    it('should export payload namespace', () => {
      expect(sdk.payload).toBeDefined();
      expect(sdk.payload.PayloadResolver).toBeDefined();
      expect(sdk.payload.PayloadType).toBeDefined();
    });

    it('should export registry namespace', () => {
      expect(sdk.registry).toBeDefined();
      expect(sdk.registry.RegistryManager).toBeDefined();
    });
  });

  describe('agent-core exports (top-level)', () => {
    it('should export NoosphereAgent', () => {
      expect(sdk.NoosphereAgent).toBeDefined();
    });

    it('should export EventMonitor', () => {
      expect(sdk.EventMonitor).toBeDefined();
    });

    it('should export ContainerManager', () => {
      expect(sdk.ContainerManager).toBeDefined();
    });

    it('should export SchedulerService', () => {
      expect(sdk.SchedulerService).toBeDefined();
    });
  });

  describe('payload utilities', () => {
    it('should have PayloadResolver class', () => {
      const resolver = new sdk.payload.PayloadResolver();
      expect(resolver).toBeDefined();
      expect(resolver.encode).toBeDefined();
      expect(resolver.resolve).toBeDefined();
    });

    it('should have payload utility functions', () => {
      expect(sdk.payload.computeContentHash).toBeDefined();
      expect(sdk.payload.createDataUriPayload).toBeDefined();
      expect(sdk.payload.detectPayloadType).toBeDefined();
    });

    it('should have storage classes', () => {
      expect(sdk.payload.DataUriStorage).toBeDefined();
      expect(sdk.payload.HttpStorage).toBeDefined();
      expect(sdk.payload.IpfsStorage).toBeDefined();
      expect(sdk.payload.S3Storage).toBeDefined();
    });
  });

  describe('contracts utilities', () => {
    it('should have contract classes', () => {
      expect(sdk.contracts.RouterContract).toBeDefined();
      expect(sdk.contracts.CoordinatorContract).toBeDefined();
    });

    it('should have ABI exports', () => {
      expect(sdk.contracts.ABIs).toBeDefined();
      expect(sdk.contracts.ABIs.Router).toBeDefined();
      expect(sdk.contracts.ABIs.Coordinator).toBeDefined();
    });
  });

  describe('crypto utilities', () => {
    it('should have WalletManager class', () => {
      expect(sdk.crypto.WalletManager).toBeDefined();
    });

    it('should have KeystoreManager class', () => {
      expect(sdk.crypto.KeystoreManager).toBeDefined();
    });
  });

  describe('registry utilities', () => {
    it('should have RegistryManager class', () => {
      expect(sdk.registry.RegistryManager).toBeDefined();
    });
  });
});
