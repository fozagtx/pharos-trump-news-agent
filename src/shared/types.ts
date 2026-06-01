export type ProductPublic = {
  id: string;
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
  createdAt: string;
  purchaseCount: number;
  agentBuyUrl?: string;
};

export type HealthResponse = {
  suiRpcUrl: string;
  suiGrpcUrl: string;
  tatumApiKeyConfigured: boolean;
  walrusPublisherUrl: string;
  walrusAggregatorUrl: string;
  maxUploadBytes: number;
  walrusEpochs: number;
  catalogProducts: number;
  contract: {
    ok: boolean;
    packageId: string | null;
    operatorCapId: string | null;
    operatorSignerConfigured: boolean;
    module: 'marketplace';
  };
  nativeX402: {
    ok: boolean;
    network: 'sui:testnet';
    scheme: 'exact';
  };
  seal: {
    ok: boolean;
    threshold: number;
    keyServers: Array<{
      objectId: string;
      weight: number;
      aggregatorUrl?: string;
    }>;
  };
  sui: {
    ok: boolean;
    checkpoint?: string;
    error?: string;
  };
};

export type LaunchProductResponse = {
  product: ProductPublic;
};

export type VerifyPurchaseResponse = {
  receipt: {
    productId: string;
    buyerAddress: string;
      transactionDigest: string;
      amountMist: string;
      verifiedAt: string;
      receiptId?: string;
    };
  deliveryUrl: string;
  delivery?: SealDeliveryDescriptor;
};

export type SealDeliveryDescriptor = {
  mode: 'seal';
  productId: string;
  title: string;
  encryptedBlobId: string;
  manifestBlobId: string;
  encryptedBlobUrl: string;
  manifestBlobUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  originalSha256: string;
  encryptedSha256: string;
  seal: {
    packageId: string;
    id: string;
    threshold: number;
    keyServers: Array<{
      objectId: string;
      weight: number;
      aggregatorUrl?: string;
    }>;
    approveMoveCall: string;
    receiptId: string;
  };
};
