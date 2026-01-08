# Contract Integration Guide

noosphere-evm 컨트랙트 변경 시 SDK 업데이트 방법과 TypeChain 통합 가이드

## 업데이트 필요 여부

| 변경 사항 | ABI | Types | Wrapper | Agent |
|---------|-----|-------|---------|-------|
| Private/internal 함수 추가/수정 | - | - | - | - |
| External 함수 추가 | O | O | O | ? |
| External 함수 시그니처 변경 | O | O | O | O |
| Struct 필드 추가/변경 | O | O | O | ? |
| Event 추가/변경 | O | ? | - | ? |
| 컨트랙트 주소 변경 (재배포) | - | - | - | O |

## 업데이트 프로세스

### 1. ABI 동기화

```bash
# noosphere-evm에서 컨트랙트 컴파일
cd noosphere-evm
forge build

# SDK로 ABI 복사
cd ../noosphere-sdk
./scripts/sync-abis.sh
```

### 2. TypeChain으로 타입 생성

```bash
cd packages/contracts
npm run typechain
npm run build
```

### 3. Agent 로직 업데이트 (필요시)

새 함수를 Agent에서 사용하는 경우:

```typescript
// packages/agent-core/src/NoosphereAgent.ts
const result = await this.router.newFunction();
```

### 4. 빌드 및 테스트

```bash
npm run build
npm test
```

---

## TypeChain 사용법

### 설정

`packages/contracts/package.json`:
```json
{
  "scripts": {
    "typechain": "typechain --target ethers-v6 --out-dir src/typechain 'src/abis/*.json'",
    "build": "npm run typechain && tsc"
  }
}
```

### 자동 생성 타입 사용

```typescript
import { Router__factory } from './typechain';

const router = Router__factory.connect(address, provider);
const subscription = await router.getComputeSubscription(id);
// subscription은 완전한 타입 안전성 보장
```

### 하이브리드 접근 (권장)

TypeChain 기본 타입 + 필요시 커스텀 wrapper:

```typescript
import { Router as TypeChainRouter } from './typechain';

export class RouterContract {
  private contract: TypeChainRouter;

  constructor(address: string, provider: Provider) {
    this.contract = Router__factory.connect(address, provider);
  }

  // 캐싱 등 추가 로직이 필요한 경우만 커스터마이징
  async getSubscriptionWithCache(id: bigint) {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const result = await this.contract.getComputeSubscription(id);
    this.cache.set(id, result);
    return result;
  }
}
```

---

## 예시: Event 필드 추가

### 1. Solidity 변경

```solidity
// Before
event RequestStarted(bytes32 indexed requestId, uint256 indexed subscriptionId);

// After
event RequestStarted(bytes32 indexed requestId, uint256 indexed subscriptionId, uint256 estimatedGas);
```

### 2. ABI 동기화 & TypeChain

```bash
cd noosphere-evm && forge build
cd ../noosphere-sdk && ./scripts/sync-abis.sh
cd packages/contracts && npm run build
```

### 3. TypeScript 타입 업데이트

```typescript
// packages/agent-core/src/types/index.ts
export interface RequestStartedEvent {
  requestId: string;
  subscriptionId: string;
  estimatedGas: bigint;  // 추가
}
```

### 4. EventMonitor 업데이트

```typescript
const requestStartedEvent: RequestStartedEvent = {
  requestId: event.args.requestId,
  subscriptionId: event.args.subscriptionId,
  estimatedGas: event.args.estimatedGas,  // 추가
};
```

---

## 버전 관리

- **Major (1.0.0 → 2.0.0)**: Breaking changes (함수 시그니처 변경)
- **Minor (1.0.0 → 1.1.0)**: 새 함수 추가 (backward compatible)
- **Patch (1.0.0 → 1.0.1)**: 버그 수정

## CI/CD 자동화 (선택)

```yaml
# .github/workflows/sync-contracts.yml
name: Sync Contracts
on:
  repository_dispatch:
    types: [evm-updated]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Sync ABIs
        run: ./scripts/sync-abis.sh
      - name: Generate TypeChain
        run: cd packages/contracts && npm run typechain
      - name: Run Tests
        run: npm test
      - name: Create PR
        uses: peter-evans/create-pull-request@v5
```
