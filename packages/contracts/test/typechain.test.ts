import { describe, it, expect } from 'vitest';

describe('TypeChain Generated Types', () => {
  it('should generate Router typechain types', async () => {
    const { RouterAbi__factory } = await import('../src/typechain');
    expect(RouterAbi__factory).toBeDefined();
    expect(typeof RouterAbi__factory.createInterface).toBe('function');
    expect(typeof RouterAbi__factory.connect).toBe('function');
  });

  it('should generate Coordinator typechain types', async () => {
    const { CoordinatorAbi__factory } = await import('../src/typechain');
    expect(CoordinatorAbi__factory).toBeDefined();
    expect(typeof CoordinatorAbi__factory.createInterface).toBe('function');
    expect(typeof CoordinatorAbi__factory.connect).toBe('function');
  });

  it('should generate SubscriptionBatchReader typechain types', async () => {
    const { SubscriptionBatchReaderAbi__factory } = await import('../src/typechain');
    expect(SubscriptionBatchReaderAbi__factory).toBeDefined();
    expect(typeof SubscriptionBatchReaderAbi__factory.createInterface).toBe('function');
    expect(typeof SubscriptionBatchReaderAbi__factory.connect).toBe('function');
  });

  it('should generate WalletFactory typechain types', async () => {
    const { WalletFactoryAbi__factory } = await import('../src/typechain');
    expect(WalletFactoryAbi__factory).toBeDefined();
    expect(typeof WalletFactoryAbi__factory.createInterface).toBe('function');
    expect(typeof WalletFactoryAbi__factory.connect).toBe('function');
  });

  it('should generate Wallet typechain types', async () => {
    const { WalletAbi__factory } = await import('../src/typechain');
    expect(WalletAbi__factory).toBeDefined();
    expect(WalletAbi__factory.createInterface).toBeDefined();
    expect(typeof WalletAbi__factory.connect).toBe('function');
  });

  it('should export all typechain factories', async () => {
    const typechain = await import('../src/typechain');

    expect(typechain.RouterAbi__factory).toBeDefined();
    expect(typechain.CoordinatorAbi__factory).toBeDefined();
    expect(typechain.SubscriptionBatchReaderAbi__factory).toBeDefined();
    expect(typechain.WalletFactoryAbi__factory).toBeDefined();
    expect(typechain.WalletAbi__factory).toBeDefined();
  });

  it('should have Router interface', async () => {
    const { RouterAbi__factory } = await import('../src/typechain');
    const iface = RouterAbi__factory.createInterface();

    expect(iface).toBeDefined();
    expect(iface.getFunction('sendRequest')).toBeDefined();
    expect(iface.getFunction('getWalletFactory')).toBeDefined();
    expect(iface.getFunction('createComputeSubscription')).toBeDefined();
  });

  it('should have WalletFactory interface', async () => {
    const { WalletFactoryAbi__factory } = await import('../src/typechain');
    const iface = WalletFactoryAbi__factory.createInterface();

    expect(iface).toBeDefined();
    expect(iface.getFunction('createWallet')).toBeDefined();
    expect(iface.getFunction('isValidWallet')).toBeDefined();
  });

  it('should have Wallet interface', async () => {
    const { WalletAbi__factory } = await import('../src/typechain');
    const iface = WalletAbi__factory.createInterface();

    expect(iface).toBeDefined();
    expect(iface.getFunction('approve')).toBeDefined();
    expect(iface.getFunction('lockForRequest')).toBeDefined();
    expect(iface.getFunction('disburseForFulfillment')).toBeDefined();
  });
});
