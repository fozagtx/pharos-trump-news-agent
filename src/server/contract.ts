import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import type { ProductPublic } from '../shared/types.js';
import { config } from './config.js';
import { keypairFromSuiSecret } from './sui-keypair.js';

const MODULE = 'marketplace';
const PRODUCT_CREATED = 'ProductCreated';
const PURCHASE_RECORDED = 'PurchaseRecorded';

type JsonRpcResponse<T> = {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

type QueryEventsResult = {
  data: Array<{
    type?: string;
    parsedJson?: Record<string, unknown>;
  }>;
  nextCursor?: unknown;
  hasNextPage?: boolean;
};

type SuiObjectResult = {
  data?: {
    objectId?: string;
    content?: {
      dataType?: string;
      type?: string;
      fields?: Record<string, unknown>;
    };
  };
  error?: unknown;
};

type SuiTransactionBlock = {
  digest: string;
  effects?: {
    status?: {
      status?: string;
      error?: string;
    };
  };
  events?: Array<{
    type?: string;
    parsedJson?: Record<string, unknown>;
  }>;
};

type ChainProductInput = {
  title: string;
  description: string;
  priceMist: string;
  sellerAddress: string;
  encryptedBlobId: string;
  manifestBlobId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  originalSha256: string;
  encryptedSha256: string;
  sealId: string;
  sealPackageId: string;
  sealThreshold?: number;
};

export type ChainReceipt = {
  productId: string;
  buyerAddress: string;
  transactionDigest: string;
  amountMist: string;
  verifiedAt: string;
  receiptId?: string;
};

export class ContractError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isContractConfigured(): boolean {
  return Boolean(config.suiPackageId && config.suiOperatorCapId && config.suiOperatorSecretKey);
}

export function isContractPublished(): boolean {
  return Boolean(config.suiPackageId);
}

export function contractStatus() {
  return {
    ok: isContractPublished(),
    packageId: config.suiPackageId || null,
    operatorCapId: config.suiOperatorCapId || null,
    operatorSignerConfigured: isContractConfigured(),
    module: MODULE,
  };
}

export async function createOnChainProduct(input: ChainProductInput): Promise<ProductPublic & { transactionDigest: string }> {
  const { client, signer } = getOperatorClient();
  const tx = new Transaction();

  tx.moveCall({
    target: `${config.suiPackageId}::${MODULE}::create_product`,
    arguments: [
      tx.object(config.suiOperatorCapId),
      tx.pure.address(input.sellerAddress),
      tx.pure.u64(input.priceMist),
      tx.pure.string(input.title),
      tx.pure.string(input.description),
      tx.pure.string(input.manifestBlobId),
      tx.pure.string(input.encryptedBlobId),
      tx.pure.string(input.fileName),
      tx.pure.string(input.fileType),
      tx.pure.u64(input.fileSize),
      tx.pure.string(input.originalSha256),
      tx.pure.string(input.encryptedSha256),
      tx.pure.vector('u8', fromHex(input.sealId)),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    include: {
      effects: true,
      events: true,
    },
  });

  if (result.$kind === 'FailedTransaction') {
    throw new ContractError(
      502,
      result.FailedTransaction.status.error?.message || 'On-chain product creation failed.',
    );
  }

  const event = result.Transaction.events?.find((item) => item.eventType.endsWith(`::${PRODUCT_CREATED}`));
  const productId = readSuiId(event?.json?.product_id);
  if (!productId) {
    throw new ContractError(502, 'Product creation succeeded but did not emit a product id.');
  }

  const product = await getOnChainProduct(productId);
  return {
    ...product,
    transactionDigest: result.Transaction.digest,
  };
}

export async function listOnChainProducts(): Promise<ProductPublic[]> {
  if (!config.suiPackageId) return [];

  const result = await suiRpc<QueryEventsResult>('suix_queryEvents', [
    {
      MoveEventType: `${config.suiPackageId}::${MODULE}::${PRODUCT_CREATED}`,
    },
    null,
    50,
    true,
  ]);

  const ids = unique(
    result.data
      .map((event) => readSuiId(event.parsedJson?.product_id))
      .filter((value): value is string => Boolean(value)),
  );
  const products = await Promise.all(ids.map((id) => getOnChainProduct(id).catch(() => null)));
  return products.filter((product): product is ProductPublic => Boolean(product));
}

export async function getOnChainProduct(productId: string): Promise<ProductPublic> {
  const object = await suiRpc<SuiObjectResult>('sui_getObject', [
    productId,
    {
      showContent: true,
    },
  ]);
  const fields = object.data?.content?.fields;
  if (!fields) {
    throw new ContractError(404, 'On-chain product not found.');
  }

  return productFromFields(productId, fields);
}

export async function verifyOnChainPurchase(
  productId: string,
  priceMist: string,
  transactionDigest: string,
  expectedBuyer?: string,
): Promise<ChainReceipt> {
  const tx = await suiRpc<SuiTransactionBlock>('sui_getTransactionBlock', [
    transactionDigest,
    {
      showEffects: true,
      showEvents: true,
    },
  ]);

  if (tx.effects?.status?.status !== 'success') {
    throw new ContractError(402, tx.effects?.status?.error || 'Sui transaction did not succeed.');
  }

  const event = tx.events?.find((item) => {
    if (!item.type?.endsWith(`::${MODULE}::${PURCHASE_RECORDED}`)) return false;
    const parsed = item.parsedJson || {};
    const eventProductId = readSuiId(parsed.product_id);
    const buyer = stringField(parsed.buyer);
    const amount = stringField(parsed.amount);
    return (
      eventProductId === productId &&
      BigInt(amount || 0) >= BigInt(priceMist) &&
      (!expectedBuyer || normalizeAddress(buyer) === normalizeAddress(expectedBuyer))
    );
  });

  if (!event?.parsedJson) {
    throw new ContractError(402, 'Transaction does not contain a matching marketplace purchase event.');
  }

  return {
    productId,
    receiptId: readSuiId(event.parsedJson.receipt_id) || undefined,
    buyerAddress: stringField(event.parsedJson.buyer) || expectedBuyer || '',
    transactionDigest: tx.digest || transactionDigest,
    amountMist: stringField(event.parsedJson.amount) || priceMist,
    verifiedAt: new Date().toISOString(),
  };
}

export async function recordAgentPurchaseOnChain(input: {
  productId: string;
  buyerAddress: string;
  amountMist: string;
  transactionDigest: string;
}): Promise<ChainReceipt> {
  const { client, signer } = getOperatorClient();
  const tx = new Transaction();

  tx.moveCall({
    target: `${config.suiPackageId}::${MODULE}::record_agent_purchase`,
    arguments: [
      tx.object(config.suiOperatorCapId),
      tx.object(input.productId),
      tx.pure.address(input.buyerAddress),
      tx.pure.u64(input.amountMist),
      tx.pure.string(input.transactionDigest),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    include: {
      effects: true,
      events: true,
    },
  });

  if (result.$kind === 'FailedTransaction') {
    throw new ContractError(
      502,
      result.FailedTransaction.status.error?.message || 'Agent purchase receipt write failed.',
    );
  }

  return verifyOnChainPurchase(input.productId, input.amountMist, result.Transaction.digest, input.buyerAddress);
}

function getOperatorClient() {
  if (!isContractConfigured()) {
    throw new ContractError(503, 'Backend operator signing is not configured.');
  }

  return {
    client: new SuiGrpcClient({ network: 'testnet', baseUrl: config.suiRpcUrl }),
    signer: keypairFromSuiSecret(config.suiOperatorSecretKey),
  };
}

async function suiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.suiRpcUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (!response.ok || payload.error) {
    throw new ContractError(502, payload.error?.message || `Sui RPC ${method} failed with ${response.status}.`);
  }

  if (payload.result === undefined) {
    throw new ContractError(502, `Sui RPC ${method} did not return a result.`);
  }

  return payload.result;
}

function productFromFields(productId: string, fields: Record<string, unknown>): ProductPublic {
  return {
    id: productId,
    title: stringField(fields.title),
    description: stringField(fields.description),
    priceMist: stringField(fields.price),
    sellerAddress: stringField(fields.seller),
    encryptedBlobId: stringField(fields.encrypted_blob_id),
    manifestBlobId: stringField(fields.manifest_blob_id),
    fileName: stringField(fields.file_name),
    fileType: stringField(fields.file_type),
    fileSize: numberField(fields.file_size),
    originalSha256: stringField(fields.original_sha256),
    encryptedSha256: stringField(fields.encrypted_sha256),
    sealId: bytesField(fields.seal_id),
    sealPackageId: config.suiPackageId,
    sealThreshold: config.sealThreshold,
    createdAt: dateFromMs(stringField(fields.created_at_ms)),
    purchaseCount: numberField(fields.purchase_count),
  };
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value && typeof value === 'object' && 'id' in value) return stringField((value as { id?: unknown }).id);
  return '';
}

function numberField(value: unknown): number {
  const text = stringField(value);
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSuiId(value: unknown): string | null {
  const text = stringField(value);
  return /^0x[a-fA-F0-9]{64}$/.test(text) ? text.toLowerCase() : null;
}

function bytesField(value: unknown): string {
  if (Array.isArray(value)) {
    return `0x${Buffer.from(value.map((item) => Number(item))).toString('hex')}`;
  }

  const text = stringField(value);
  if (/^0x[a-fA-F0-9]+$/.test(text)) return text.toLowerCase();
  return '';
}

function dateFromMs(value: string): string {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
