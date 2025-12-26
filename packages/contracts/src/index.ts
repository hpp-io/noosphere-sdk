/**
 * @noosphere/contracts
 * TypeScript wrappers for Noosphere smart contracts
 */

// TypeChain-generated types (auto-generated, fully type-safe)
export * from './typechain';

// Custom contract wrappers (convenience methods and data transformation)
export { RouterContract } from './Router';
export { CoordinatorContract } from './Coordinator';
export { SubscriptionBatchReaderContract } from './SubscriptionBatchReader';

// Custom types
export * from './types';

// ABIs
import RouterABI from './abis/Router.abi.json';
import CoordinatorABI from './abis/Coordinator.abi.json';
import SubscriptionBatchReaderABI from './abis/SubscriptionBatchReader.abi.json';
import WalletFactoryABI from './abis/WalletFactory.abi.json';
import WalletABI from './abis/Wallet.abi.json';

export const ABIs = {
  Router: RouterABI,
  Coordinator: CoordinatorABI,
  SubscriptionBatchReader: SubscriptionBatchReaderABI,
  WalletFactory: WalletFactoryABI,
  Wallet: WalletABI,
};
