import type { ProductRecord } from './catalog.js';
import { config } from './config.js';
import { isContractPublished, verifyOnChainPurchase } from './contract.js';

const SUI_COIN_TYPE = '0x2::sui::SUI';

type JsonRpcResponse<T> = {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

type BalanceChange = {
  owner: unknown;
  coinType: string;
  amount: string;
};

type SuiTransactionBlock = {
  digest: string;
  transaction?: {
    data?: {
      sender?: string;
    };
  };
  effects?: {
    status?: {
      status?: string;
      error?: string;
    };
  };
  balanceChanges?: BalanceChange[];
};

export type VerifiedPayment = {
  buyerAddress: string;
  transactionDigest: string;
  amountMist: string;
  receiptId?: string;
};

export async function getLatestCheckpoint(): Promise<string> {
  const result = await suiRpc<string>('sui_getLatestCheckpointSequenceNumber', []);
  return result;
}

export async function verifySuiPayment(
  product: ProductRecord,
  transactionDigest: string,
  expectedBuyer?: string,
): Promise<VerifiedPayment> {
  if (isContractPublished()) {
    const receipt = await verifyOnChainPurchase(product.id, product.priceMist, transactionDigest, expectedBuyer);
    return {
      buyerAddress: receipt.buyerAddress,
      transactionDigest: receipt.transactionDigest,
      amountMist: receipt.amountMist,
      receiptId: receipt.receiptId,
    };
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(transactionDigest)) {
    throw new Error('Transaction digest is not a valid Sui digest.');
  }

  const tx = await suiRpc<SuiTransactionBlock>('sui_getTransactionBlock', [
    transactionDigest,
    {
      showInput: true,
      showEffects: true,
      showBalanceChanges: true,
    },
  ]);

  if (tx.effects?.status?.status !== 'success') {
    throw new Error(tx.effects?.status?.error || 'Sui transaction did not succeed.');
  }

  const payTo = normalizeSuiAddress(product.sellerAddress);
  const recipientChange = tx.balanceChanges?.find((change) => {
    return (
      change.coinType === SUI_COIN_TYPE &&
      normalizeSuiAddress(ownerAddress(change.owner) || '') === payTo &&
      BigInt(change.amount) >= BigInt(product.priceMist)
    );
  });

  if (!recipientChange) {
    throw new Error('Sui transaction does not pay the seller the required SUI amount.');
  }

  const sender = normalizeSuiAddress(tx.transaction?.data?.sender || '');
  const expected = expectedBuyer ? normalizeSuiAddress(expectedBuyer) : undefined;

  if (expected && sender && sender !== expected) {
    throw new Error('Sui transaction sender does not match the buyer address.');
  }

  return {
    buyerAddress: sender || expected || 'unknown',
    transactionDigest: tx.digest || transactionDigest,
    amountMist: BigInt(recipientChange.amount).toString(),
  };
}

export function normalizeSuiAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isSuiAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address.trim());
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
    throw new Error(payload.error?.message || `Sui RPC ${method} failed with ${response.status}.`);
  }

  if (payload.result === undefined) {
    throw new Error(`Sui RPC ${method} did not return a result.`);
  }

  return payload.result;
}

function ownerAddress(owner: unknown): string | null {
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
    const address = (owner as { AddressOwner?: unknown }).AddressOwner;
    return typeof address === 'string' ? address : null;
  }
  return null;
}
