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
}

export interface VerifierMetadata {
  id: string; // UUID
  name: string;
  verifierAddress: string; // Onchain verifier contract address
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
  statusCode: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  verified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
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
  version: string;
  updatedAt: string;
}
