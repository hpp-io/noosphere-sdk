export interface ContainerMetadata {
  id: string; // keccak256 hash
  name: string;
  imageName: string;
  port?: number;
  command?: string;
  env?: Record<string, string>;
  volumes?: string[];
  payments?: {
    basePrice: string;
    token: string;
    per: string;
  };
  requirements?: {
    memory?: string;
    cpu?: number;
    gpu?: boolean;
  };
  statusCode: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  verified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  tags?: string[];
  inputSchema?: {
    type: string;
    required?: string[];
    properties?: Record<string, {
      type: string;
      description?: string;
      default?: string;
      examples?: string[];
      properties?: Record<string, { type: string; description?: string }>;
    }>;
  } | null;
}

export interface ProofServiceConfig {
  imageName: string;
  port: number;
  command?: string;
  env?: Record<string, string>;
  volumes?: string[];
  requirements?: {
    memory?: string;
    cpu?: number;
    gpu?: boolean;
  };
}

export interface VerifierMetadata {
  id: string; // UUID
  name: string;
  verifierAddress: string; // Onchain verifier contract address
  requiresProof?: boolean; // Whether this verifier requires proof generation
  proofService?: ProofServiceConfig; // Proof generation service configuration (required if requiresProof is true)

  // Deprecated: Use proofService instead
  imageName?: string;
  port?: number;
  command?: string;
  env?: Record<string, string>;
  volumes?: string[];

  payments?: {
    basePrice: string;
    token: string;
    per: string;
  };
  statusCode: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  verified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
}

export interface DeploymentMetadata {
  chainId: number;
  name: string;
  rpcUrl: string;
  wsRpcUrl?: string;
  blockExplorerUrl?: string;
  contracts: Record<string, string>;
  statusCode: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  description?: string;
  updatedAt?: string;
}

export interface RegistryConfig {
  localPath?: string;
  remotePath?: string;
  autoSync?: boolean;
  cacheTTL?: number; // milliseconds
}

export interface RegistryIndex {
  containers: Record<string, ContainerMetadata>;
  verifiers: Record<string, VerifierMetadata>;
  deployments?: Record<string, DeploymentMetadata>;
  version: string;
  updatedAt: string;
}
