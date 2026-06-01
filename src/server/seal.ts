import crypto from 'node:crypto';
import { SealClient, SessionKey, type KeyServerConfig, type SealCompatibleClient } from '@mysten/seal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import type { SealDeliveryDescriptor } from '../shared/types.js';
import { config } from './config.js';
import type { ProductRecord, PurchaseRecord } from './catalog.js';
import { downloadWalrusBlob } from './walrus.js';
import type { SupportedSuiKeypair } from './sui-keypair.js';
import { sha256 } from './crypto.js';

const SEAL_ID_BYTES = 32;
const SEAL_APPROVE_FUNCTION = 'seal_approve_access';

export type SealEncryptedAsset = {
  encryptedBytes: Buffer;
  sealId: string;
  packageId: string;
  threshold: number;
  originalSha256: string;
  encryptedSha256: string;
};

export async function encryptAssetForSeal(input: Buffer): Promise<SealEncryptedAsset> {
  if (!config.suiPackageId) {
    throw new Error('Seal encryption requires SUI_PACKAGE_ID so the access policy has a package namespace.');
  }

  const sealId = randomSealId();
  const client = createSealClient();
  const { encryptedObject } = await client.encrypt({
    threshold: config.sealThreshold,
    packageId: config.suiPackageId,
    id: sealId,
    data: new Uint8Array(input),
  });
  const encryptedBytes = Buffer.from(encryptedObject);

  return {
    encryptedBytes,
    sealId,
    packageId: config.suiPackageId,
    threshold: config.sealThreshold,
    originalSha256: sha256(input),
    encryptedSha256: sha256(encryptedBytes),
  };
}

export function buildSealDeliveryDescriptor(
  product: ProductRecord,
  receipt: PurchaseRecord,
): SealDeliveryDescriptor {
  if (!receipt.receiptId) {
    throw new Error('Seal delivery requires a receipt object id. Redeploy the Seal-enabled contract.');
  }

  const packageId = product.sealPackageId || config.suiPackageId;
  return {
    mode: 'seal',
    productId: product.id,
    title: product.title,
    encryptedBlobId: product.encryptedBlobId,
    manifestBlobId: product.manifestBlobId,
    encryptedBlobUrl: walrusBlobUrl(product.encryptedBlobId),
    manifestBlobUrl: walrusBlobUrl(product.manifestBlobId),
    fileName: product.fileName,
    fileType: product.fileType,
    fileSize: product.fileSize,
    originalSha256: product.originalSha256,
    encryptedSha256: product.encryptedSha256,
    seal: {
      packageId,
      id: product.sealId,
      threshold: product.sealThreshold || config.sealThreshold,
      keyServers: sealKeyServers(),
      approveMoveCall: `${packageId}::marketplace::${SEAL_APPROVE_FUNCTION}`,
      receiptId: receipt.receiptId,
    },
  };
}

export async function decryptSealDelivery(
  delivery: SealDeliveryDescriptor,
  keypair: SupportedSuiKeypair,
): Promise<Buffer> {
  const encryptedBytes = await downloadWalrusBlob(delivery.encryptedBlobId);
  const txBytes = await buildSealApprovalTxBytes(delivery);
  const suiClient = createSuiClient();
  const sessionKey = await SessionKey.create({
    address: suiAddress(keypair),
    packageId: delivery.seal.packageId,
    ttlMin: 10,
    signer: keypair,
    suiClient,
  });
  const client = createSealClient(delivery.seal.keyServers, suiClient);
  const decrypted = await client.decrypt({
    data: encryptedBytes,
    sessionKey,
    txBytes,
  });
  return Buffer.from(decrypted);
}

export function sealKeyServers(): KeyServerConfig[] {
  return config.sealKeyServers.map((server) => ({ ...server }));
}

export function randomSealId(): string {
  return `0x${crypto.randomBytes(SEAL_ID_BYTES).toString('hex')}`;
}

async function buildSealApprovalTxBytes(delivery: SealDeliveryDescriptor): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: delivery.seal.approveMoveCall,
    arguments: [
      tx.pure.vector('u8', fromHex(delivery.seal.id)),
      tx.object(delivery.productId),
      tx.object(delivery.seal.receiptId),
    ],
  });

  return tx.build({
    client: createSuiClient(),
    onlyTransactionKind: true,
  });
}

function createSealClient(keyServers = sealKeyServers(), suiClient = createSuiClient()): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: keyServers,
    verifyKeyServers: true,
  });
}

function createSuiClient(): SealCompatibleClient {
  return new SuiGrpcClient({
    network: 'testnet',
    baseUrl: config.suiRpcUrl,
  }) as unknown as SealCompatibleClient;
}

function walrusBlobUrl(blobId: string): string {
  return `${config.walrusAggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;
}

function suiAddress(keypair: SupportedSuiKeypair): string {
  return `0x${keypair.toSuiAddress().replace(/^0x/, '')}`;
}
