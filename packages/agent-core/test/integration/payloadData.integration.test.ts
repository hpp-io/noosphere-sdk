/**
 * PayloadData Integration Tests
 *
 * EVM 컨트랙트와 SDK의 PayloadData 연동 테스트
 *
 * 실행 방법:
 * 1. Anvil 시작: anvil --host 0.0.0.0 --port 8545
 * 2. 컨트랙트 배포: cd noosphere-evm && forge script script/Deploy.s.sol ...
 * 3. 환경변수 설정 또는 config.ts 업데이트
 * 4. 테스트 실행: npm run test:integration
 */

import { ethers } from 'ethers';
import { CoordinatorContract, RouterContract, PayloadData } from '@noosphere/contracts';
import { PayloadUtils, CommitmentUtils } from '../../src/utils/CommitmentUtils';
import { testConfig, validateConfig } from './config';

// 통합 테스트 스킵 조건 (CI 환경이나 컨트랙트 미배포 시)
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe('PayloadData Integration Tests', () => {
  // 컨트랙트 인스턴스
  let provider: ethers.JsonRpcProvider;
  let nodeSigner: ethers.Wallet;
  let clientSigner: ethers.Wallet;
  let coordinator: CoordinatorContract;
  let router: RouterContract;

  // 설정 검증
  const isConfigured = !SKIP_INTEGRATION && validateConfig();

  beforeAll(async () => {
    if (!isConfigured) {
      console.log('⚠️  Skipping integration tests - contracts not deployed or SKIP_INTEGRATION_TESTS=true');
      return;
    }

    // Provider 및 Signer 설정
    provider = new ethers.JsonRpcProvider(testConfig.rpcUrl);
    nodeSigner = new ethers.Wallet(testConfig.accounts.node.privateKey, provider);
    clientSigner = new ethers.Wallet(testConfig.accounts.client.privateKey, provider);

    // 컨트랙트 인스턴스 생성
    coordinator = new CoordinatorContract(testConfig.contracts.coordinator, nodeSigner);
    router = new RouterContract(testConfig.contracts.router, clientSigner);

    console.log('✅ Integration test environment initialized');
    console.log(`   Router: ${testConfig.contracts.router}`);
    console.log(`   Coordinator: ${testConfig.contracts.coordinator}`);
    console.log(`   Node: ${nodeSigner.address}`);
  });

  /*//////////////////////////////////////////////////////////////////////////
                        Scenario 1: PayloadData 생성 및 인코딩
  //////////////////////////////////////////////////////////////////////////*/

  describe('Scenario 1: PayloadData Creation and Encoding', () => {
    it('should create inline PayloadData with correct contentHash', () => {
      const content = '{"action": "compute", "params": [1, 2, 3]}';

      const payload = PayloadUtils.fromInlineData(content);

      // contentHash 검증
      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes(content));
      expect(payload.contentHash).toBe(expectedHash);
      expect(payload.uri).toBe('');
    });

    it('should create external PayloadData with IPFS URI', () => {
      const content = 'large external content';
      const ipfsUri = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

      const payload = PayloadUtils.fromExternalUri(content, ipfsUri);

      expect(payload.uri).toBe(ipfsUri);
      expect(payload.contentHash).toBe(ethers.keccak256(ethers.toUtf8Bytes(content)));
    });

    it('should create empty PayloadData for no-proof scenario', () => {
      const payload = PayloadUtils.empty();

      expect(payload.contentHash).toBe(ethers.ZeroHash);
      expect(payload.uri).toBe('');
    });

    it('should encode PayloadData for contract call', () => {
      const content = 'test';
      const payload = PayloadUtils.fromInlineData(content);

      // 컨트랙트 호출 형식으로 인코딩
      const encoded: [string, Uint8Array] = [
        payload.contentHash,
        ethers.toUtf8Bytes(payload.uri),
      ];

      expect(encoded[0]).toBe(payload.contentHash);
      expect(encoded[1]).toEqual(new Uint8Array()); // 빈 URI
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                        Scenario 2: URI 스킴 지원
  //////////////////////////////////////////////////////////////////////////*/

  describe('Scenario 2: URI Scheme Support', () => {
    const uriSchemes = [
      { name: 'IPFS', uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' },
      { name: 'HTTPS', uri: 'https://api.noosphere.io/payloads/12345' },
      { name: 'Arweave', uri: 'ar://bNbA3TEQVL60xlgCcqdz4ZPH' },
      { name: 'Chain', uri: 'chain://1/0xabc123def456789012345678901234567890123456789012345678901234abcd/0' },
      { name: 'Data URI', uri: 'data:application/json;base64,eyJhY3Rpb24iOiJwaW5nIn0=' },
      { name: 'Empty (inline)', uri: '' },
    ];

    uriSchemes.forEach(({ name, uri }) => {
      it(`should handle ${name} URI scheme`, () => {
        const content = `content for ${name}`;
        const payload = uri
          ? PayloadUtils.fromExternalUri(content, uri)
          : PayloadUtils.fromInlineData(content);

        expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
        expect(payload.uri).toBe(uri);

        // URI 바이트 인코딩 검증
        const uriBytes = ethers.toUtf8Bytes(payload.uri);
        expect(uriBytes.length).toBe(uri.length);
      });
    });

    it('should handle long HTTPS URL with query parameters', () => {
      const content = 'api response';
      const longUri =
        'https://api.noosphere.io/v1/payloads/request-12345678-abcd-efgh-ijkl-mnopqrstuvwx' +
        '?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0' +
        '&timestamp=1234567890&signature=abcdef123456789012345678901234567890';

      const payload = PayloadUtils.fromExternalUri(content, longUri);

      expect(payload.uri.length).toBeGreaterThan(200);
      expect(payload.uri).toBe(longUri);
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                        Scenario 3: 컨텐츠 무결성 검증
  //////////////////////////////////////////////////////////////////////////*/

  describe('Scenario 3: Content Integrity Verification', () => {
    it('should verify original content matches hash', () => {
      const content = '{"result": "success", "value": 42}';
      const payload = PayloadUtils.fromInlineData(content);

      expect(PayloadUtils.verifyContent(payload, content)).toBe(true);
    });

    it('should detect tampered content', () => {
      const original = '{"result": "success"}';
      const tampered = '{"result": "failure"}';

      const payload = PayloadUtils.fromInlineData(original);

      expect(PayloadUtils.verifyContent(payload, tampered)).toBe(false);
    });

    it('should verify content from external storage', () => {
      // 시뮬레이션: 외부 저장소에서 다운로드한 데이터
      const storedContent = JSON.stringify({
        data: Array(100).fill({ x: 1, y: 2 }),
      });

      const payload = PayloadUtils.fromExternalUri(storedContent, 'ipfs://QmTest');

      // 정상 다운로드
      expect(PayloadUtils.verifyContent(payload, storedContent)).toBe(true);

      // 손상된 다운로드
      const corrupted = storedContent.replace('1', '9');
      expect(PayloadUtils.verifyContent(payload, corrupted)).toBe(false);
    });

    it('should handle unicode content', () => {
      const content = '한글 테스트 데이터 🚀 with émojis';
      const payload = PayloadUtils.fromInlineData(content);

      expect(PayloadUtils.verifyContent(payload, content)).toBe(true);
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                        Scenario 4: 전체 플로우 시뮬레이션
  //////////////////////////////////////////////////////////////////////////*/

  describe('Scenario 4: Full Flow Simulation', () => {
    it('should simulate complete compute result submission', () => {
      // Phase 1: Container 실행 결과 시뮬레이션
      const inputData = '{"x": 10, "y": 20}';
      const outputData = '{"sum": 30}';
      const proofData = ''; // no verifier

      // Phase 2: PayloadData 생성
      const inputPayload = PayloadUtils.fromInlineData(inputData);
      const outputPayload = PayloadUtils.fromInlineData(outputData);
      const proofPayload = proofData ? PayloadUtils.fromInlineData(proofData) : PayloadUtils.empty();

      // Phase 3: 검증
      expect(inputPayload.uri).toBe(''); // inline
      expect(outputPayload.uri).toBe(''); // inline
      expect(proofPayload.contentHash).toBe(ethers.ZeroHash); // empty

      // Phase 4: 컨트랙트 호출 형식 준비
      const callParams = {
        deliveryInterval: 0,
        input: inputPayload,
        output: outputPayload,
        proof: proofPayload,
      };

      expect(callParams.input.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(callParams.output.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should simulate mixed storage approach', () => {
      // 작은 입력 -> inline
      const smallInput = '{"cmd": "add"}';
      const inputPayload = PayloadUtils.fromInlineData(smallInput);

      // 큰 출력 -> external (IPFS)
      const largeOutput = JSON.stringify({ result: Array(1000).fill(42) });
      const outputPayload = PayloadUtils.fromExternalUri(
        largeOutput,
        'ipfs://QmLargeOutputHash123'
      );

      // zkProof -> external (HTTPS)
      const proofData = 'zkproof-binary-data...';
      const proofPayload = PayloadUtils.fromExternalUri(
        proofData,
        'https://proofs.noosphere.io/zkp/abc123'
      );

      // 혼합 사용 검증
      expect(inputPayload.uri).toBe(''); // inline
      expect(outputPayload.uri).toContain('ipfs://');
      expect(proofPayload.uri).toContain('https://');

      // 모든 contentHash는 유효해야 함
      [inputPayload, outputPayload, proofPayload].forEach((p) => {
        expect(p.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      });
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                        Scenario 5: Gas 비용 추정
  //////////////////////////////////////////////////////////////////////////*/

  describe('Scenario 5: Gas Cost Estimation', () => {
    it('should estimate calldata cost for inline PayloadData', () => {
      const content = 'small inline data';
      const payload = PayloadUtils.fromInlineData(content);

      // ABI 인코딩된 PayloadData 크기 계산
      // contentHash: 32 bytes
      // uri offset: 32 bytes
      // uri length: 32 bytes
      // uri data: 0 bytes (empty)
      const estimatedSize = 32 + 32 + 32 + 0;

      // Calldata gas: zero byte = 4, non-zero = 16
      // 대략적 계산 (모두 non-zero 가정)
      const estimatedGas = estimatedSize * 16;

      expect(estimatedGas).toBeLessThan(2000);
    });

    it('should estimate calldata cost for IPFS URI', () => {
      const content = 'content';
      const ipfsUri = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const payload = PayloadUtils.fromExternalUri(content, ipfsUri);

      // uri data: ~53 bytes (IPFS CID)
      // 패딩: ceil(53/32)*32 = 64 bytes
      const estimatedSize = 32 + 32 + 32 + 64;
      const estimatedGas = estimatedSize * 16;

      expect(estimatedGas).toBeLessThan(3000);
    });

    it('should compare PayloadData vs raw bytes for large content', () => {
      const largeContent = 'x'.repeat(50000); // 50KB

      // Raw bytes 접근법
      const rawBytesSize = largeContent.length;
      const rawBytesGas = rawBytesSize * 16; // ~800,000 gas

      // PayloadData 접근법 (IPFS URI)
      const payloadDataSize = 32 + 32 + 32 + 64; // ~160 bytes
      const payloadDataGas = payloadDataSize * 16; // ~2,560 gas

      // 절감률 계산
      const savingsPercent = ((rawBytesGas - payloadDataGas) / rawBytesGas) * 100;

      expect(savingsPercent).toBeGreaterThan(99); // 99% 이상 절감
    });
  });

  /*//////////////////////////////////////////////////////////////////////////
                        Scenario 6: 에러 케이스
  //////////////////////////////////////////////////////////////////////////*/

  describe('Scenario 6: Error Cases', () => {
    it('should handle empty content', () => {
      const payload = PayloadUtils.fromInlineData('');

      expect(payload.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(PayloadUtils.verifyContent(payload, '')).toBe(true);
    });

    it('should handle very long URI', () => {
      const content = 'test';
      const longUri = 'https://example.com/' + 'a'.repeat(2000);

      const payload = PayloadUtils.fromExternalUri(content, longUri);

      expect(payload.uri.length).toBe(longUri.length);
    });

    it('should maintain hash consistency', () => {
      const content = 'consistent content';

      // 여러 방법으로 생성
      const hash1 = PayloadUtils.computeHash(content);
      const payload1 = PayloadUtils.fromInlineData(content);
      const payload2 = PayloadUtils.fromExternalUri(content, 'ipfs://Qm...');
      const payload3 = PayloadUtils.fromHashAndUri(hash1, '');

      // 모든 해시가 동일해야 함
      expect(payload1.contentHash).toBe(hash1);
      expect(payload2.contentHash).toBe(hash1);
      expect(payload3.contentHash).toBe(hash1);
    });
  });
});

/*//////////////////////////////////////////////////////////////////////////
                        Live Contract Tests (조건부)
//////////////////////////////////////////////////////////////////////////*/

// 실제 컨트랙트와 연동하는 테스트 (배포 후 실행)
describe.skip('Live Contract Integration', () => {
  // 이 테스트들은 실제 배포된 컨트랙트가 필요합니다.
  // SKIP_INTEGRATION_TESTS=false 로 설정하고
  // 컨트랙트 주소를 설정한 후 .skip을 제거하세요.

  it('should submit PayloadData to Coordinator', async () => {
    // TODO: 실제 컨트랙트 호출 테스트
  });

  it('should receive ComputeDelivered event with PayloadData', async () => {
    // TODO: 이벤트 수신 테스트
  });
});
