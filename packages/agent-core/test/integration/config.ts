/**
 * Integration Test Configuration
 *
 * 이 파일을 사용하기 전에 다음 단계를 완료해야 합니다:
 * 1. Anvil 시작: anvil --host 0.0.0.0 --port 8545
 * 2. noosphere-evm 컨트랙트 배포
 * 3. 배포된 주소로 contracts 섹션 업데이트
 */

export const testConfig = {
  // RPC 설정
  rpcUrl: process.env.TEST_RPC_URL || 'http://localhost:8545',
  wsRpcUrl: process.env.TEST_WS_RPC_URL || 'ws://localhost:8545',
  chainId: 31337,

  // Anvil 기본 테스트 계정
  accounts: {
    // 배포자 계정
    deployer: {
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },
    // 노드 운영자 계정
    node: {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    },
    // 클라이언트 계정
    client: {
      address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    },
    // 추가 계정 (멀티 노드 테스트용)
    node2: {
      address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    },
  },

  // 배포된 컨트랙트 주소 (배포 후 업데이트 필요)
  // 환경변수로 오버라이드 가능
  contracts: {
    router: process.env.TEST_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000',
    coordinator: process.env.TEST_COORDINATOR_ADDRESS || '0x0000000000000000000000000000000000000000',
    walletFactory: process.env.TEST_WALLET_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000',
  },

  // 테스트 파라미터
  testParams: {
    // 테스트용 컨테이너 ID
    containerId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    // 기본 fee (0.001 ETH)
    defaultFee: '1000000000000000',
    // 인터벌 (초)
    intervalSeconds: 60,
    // redundancy
    redundancy: 1,
  },

  // 타임아웃 설정
  timeouts: {
    transaction: 30000, // 30초
    block: 5000, // 5초
  },
};

/**
 * 컨트랙트 주소가 설정되었는지 확인
 */
export function validateConfig(): boolean {
  const { router, coordinator, walletFactory } = testConfig.contracts;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  if (router === zeroAddress || coordinator === zeroAddress || walletFactory === zeroAddress) {
    console.error('❌ Contract addresses not configured!');
    console.error('Please deploy contracts and update testConfig.contracts or set environment variables:');
    console.error('  - TEST_ROUTER_ADDRESS');
    console.error('  - TEST_COORDINATOR_ADDRESS');
    console.error('  - TEST_WALLET_FACTORY_ADDRESS');
    return false;
  }

  return true;
}

export default testConfig;
