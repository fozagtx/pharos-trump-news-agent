import type { ProductPublic } from '../shared/types.js';
import {
  createOnChainProduct,
  getOnChainProduct,
  isContractConfigured,
  isContractPublished,
  listOnChainProducts,
  recordAgentPurchaseOnChain,
} from './contract.js';

export type PurchaseRecord = {
  productId: string;
  buyerAddress: string;
  transactionDigest: string;
  amountMist: string;
  verifiedAt: string;
  receiptId?: string;
  via: 'human' | 'agent';
};

export type ProductRecord = {
  id: string;
  title: string;
  description: string;
  priceMist: string;
  sellerAddress: string;
  encryptedBlobId: string;
  manifestBlobId: string;
  walrusObjectId?: string;
  manifestWalrusObjectId?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  originalSha256: string;
  encryptedSha256: string;
  sealId: string;
  sealPackageId: string;
  sealThreshold?: number;
  createdAt: string;
  purchases: PurchaseRecord[];
};

export async function listProducts(): Promise<ProductPublic[]> {
  if (isContractPublished()) {
    return listOnChainProducts();
  }

  return [];
}

export async function getProduct(productId: string): Promise<ProductRecord | null> {
  if (!isContractPublished()) {
    return null;
  }

  const chainProduct = await getOnChainProduct(productId);
  return {
    ...chainProduct,
    sealThreshold: chainProduct.sealThreshold,
    purchases: [],
  };
}

export async function getPurchaseByDigest(digest: string): Promise<PurchaseRecord | null> {
  return null;
}

export async function createProduct(input: Omit<ProductRecord, 'id' | 'createdAt' | 'purchases'>) {
  if (!isContractConfigured()) {
    throw new Error(
      'Backend operator signing is not configured. Use a dedicated service key for SUI_OPERATOR_SECRET_KEY, not a personal deploy key.',
    );
  }

  const chainProduct = await createOnChainProduct(input);
  const product: ProductRecord = {
    ...chainProduct,
    id: chainProduct.id,
    createdAt: chainProduct.createdAt,
    sealThreshold: input.sealThreshold,
    purchases: [],
  };

  return product;
}

export async function registerPurchase(
  productId: string,
  purchase: Omit<PurchaseRecord, 'productId' | 'verifiedAt'>,
): Promise<PurchaseRecord> {
  if (isContractConfigured()) {
    if (purchase.via === 'agent') {
      const receipt = await recordAgentPurchaseOnChain({
        productId,
        buyerAddress: purchase.buyerAddress,
        amountMist: purchase.amountMist,
        transactionDigest: purchase.transactionDigest,
      });
      return {
        ...receipt,
        via: 'agent',
      };
    }

    return {
      ...purchase,
      productId,
      verifiedAt: new Date().toISOString(),
    };
  }

  throw new Error('Sui marketplace contract is required. Local catalog persistence is disabled.');
}

export function redactProduct(product: ProductRecord): ProductPublic {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    priceMist: product.priceMist,
    sellerAddress: product.sellerAddress,
    encryptedBlobId: product.encryptedBlobId,
    manifestBlobId: product.manifestBlobId,
    fileName: product.fileName,
    fileType: product.fileType,
    fileSize: product.fileSize,
    originalSha256: product.originalSha256,
    encryptedSha256: product.encryptedSha256,
    sealId: product.sealId,
    sealPackageId: product.sealPackageId,
    sealThreshold: product.sealThreshold,
    createdAt: product.createdAt,
    purchaseCount: product.purchases.length,
  };
}
