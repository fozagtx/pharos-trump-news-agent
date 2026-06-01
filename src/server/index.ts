import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import {
  createProduct,
  getProduct,
  getPurchaseByDigest,
  listProducts,
  redactProduct,
  registerPurchase,
} from './catalog.js';
import { config } from './config.js';
import { uploadWalrusBlob } from './walrus.js';
import { getLatestCheckpoint, isSuiAddress, verifySuiPayment } from './sui.js';
import {
  absoluteRequestUrl,
  buildProductPaymentRequired,
  isNativeX402Configured,
  NativeX402Error,
  sendPaymentRequired,
  settleProductPayment,
} from './native-x402.js';
import { ContractError, contractStatus, isContractConfigured, isContractPublished } from './contract.js';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import type { ProductPublic } from '../shared/types.js';
import { buildSealDeliveryDescriptor, encryptAssetForSeal, sealKeyServers } from './seal.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
});

const launchSchema = z.object({
  title: z.string().trim().min(2).max(90),
  description: z.string().trim().max(700).default(''),
  priceMist: z.string().regex(/^[1-9]\d*$/),
  sellerAddress: z.string().refine(isSuiAddress, 'Seller must be a full Sui address.'),
});

const purchaseSchema = z.object({
  transactionDigest: z.string().min(32).max(96),
  buyerAddress: z.string().optional(),
});

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,payment-signature');
  res.setHeader('access-control-expose-headers', 'payment-required,payment-response,content-disposition');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/health', async (_, res) => {
  const products = await listProducts();
  const health = {
    suiRpcUrl: config.suiRpcUrl,
    walrusPublisherUrl: config.walrusPublisherUrl,
    walrusAggregatorUrl: config.walrusAggregatorUrl,
    maxUploadBytes: config.maxUploadBytes,
    walrusEpochs: config.walrusEpochs,
    catalogProducts: products.length,
    contract: contractStatus(),
    nativeX402: {
      ok: isNativeX402Configured(),
      network: 'sui:testnet',
      scheme: 'exact',
    },
    seal: {
      ok: Boolean(config.suiPackageId),
      threshold: config.sealThreshold,
      keyServers: sealKeyServers(),
    },
    sui: await getSuiHealth(),
  };

  res.json(health);
});

app.get('/api/products', async (req, res) => {
  res.json({ products: (await listProducts()).map((product) => withAgentBuyUrl(req, product)) });
});

app.post('/api/products', upload.single('file'), async (req, res) => {
  const parsed = launchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0]?.message || 'Invalid product input.' });
  }

  if (!req.file) {
    return res.status(422).json({ error: 'Upload a real digital product file.' });
  }

  if (!isContractConfigured()) {
    return res.status(503).json({
      error:
        'Backend operator signing is not configured. Do not use your personal deploy key here; use a dedicated service key that owns SUI_OPERATOR_CAP_ID, or switch launch to wallet-signed product creation.',
    });
  }

  const encrypted = await encryptAssetForSeal(req.file.buffer);
  const assetUpload = await uploadWalrusBlob(encrypted.encryptedBytes, 'application/octet-stream');
  const manifest = {
    title: parsed.data.title,
    description: parsed.data.description,
    priceMist: parsed.data.priceMist,
    sellerAddress: parsed.data.sellerAddress,
    encryptedBlobId: assetUpload.blobId,
    fileName: req.file.originalname,
    fileType: req.file.mimetype || 'application/octet-stream',
    fileSize: req.file.size,
    originalSha256: encrypted.originalSha256,
    encryptedSha256: encrypted.encryptedSha256,
    seal: {
      packageId: encrypted.packageId,
      id: encrypted.sealId,
      threshold: encrypted.threshold,
      keyServers: sealKeyServers(),
      approveMoveCall: `${encrypted.packageId}::marketplace::seal_approve_access`,
    },
    createdAt: new Date().toISOString(),
    chain: 'sui:testnet',
    storage: 'walrus:testnet',
  };
  const manifestUpload = await uploadWalrusBlob(Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');

  const product = await createProduct({
    title: parsed.data.title,
    description: parsed.data.description,
    priceMist: parsed.data.priceMist,
    sellerAddress: parsed.data.sellerAddress,
    encryptedBlobId: assetUpload.blobId,
    manifestBlobId: manifestUpload.blobId,
    walrusObjectId: assetUpload.objectId,
    manifestWalrusObjectId: manifestUpload.objectId,
    fileName: req.file.originalname,
    fileType: req.file.mimetype || 'application/octet-stream',
    fileSize: req.file.size,
    originalSha256: encrypted.originalSha256,
    encryptedSha256: encrypted.encryptedSha256,
    sealId: encrypted.sealId,
    sealPackageId: encrypted.packageId,
    sealThreshold: encrypted.threshold,
  });

  res.status(201).json({ product: withAgentBuyUrl(req, redactProduct(product)) });
});

app.post('/api/products/:productId/purchases', async (req, res) => {
  const product = await requireProduct(req.params.productId);
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0]?.message || 'Invalid purchase input.' });
  }

  const receipt = await verifyAndRegister(product.id, parsed.data.transactionDigest, parsed.data.buyerAddress, 'human');
  const delivery = buildSealDeliveryDescriptor(product, receipt);
  res.json({
    receipt,
    deliveryUrl: `/api/products/${product.id}/delivery?digest=${encodeURIComponent(receipt.transactionDigest)}`,
    delivery,
  });
});

app.get('/api/products/:productId/delivery', async (req, res) => {
  const product = await requireProduct(req.params.productId);
  const digest = typeof req.query.digest === 'string' ? req.query.digest : '';
  const receipt = await getPurchaseByDigest(digest);

  if (isContractPublished()) {
    const verified = await verifySuiPayment(product, digest);
    return sendSealDelivery(res, product, {
      productId: product.id,
      buyerAddress: verified.buyerAddress,
      transactionDigest: verified.transactionDigest,
      amountMist: verified.amountMist,
      verifiedAt: new Date().toISOString(),
      receiptId: verified.receiptId,
      via: 'human',
    });
  } else if (!receipt || receipt.productId !== product.id) {
    return res.status(403).json({ error: 'A verified Sui testnet purchase receipt is required.' });
  }

  return sendSealDelivery(res, product, receipt);
});

app.get('/api/products/:productId/download', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(307, `/api/products/${encodeURIComponent(req.params.productId)}/delivery${query}`);
});

app.get('/x402/products/:productId/asset', async (req, res) => {
  const product = await requireProduct(req.params.productId);
  const paymentHeader = Array.isArray(req.headers['payment-signature'])
    ? req.headers['payment-signature'][0]
    : req.headers['payment-signature'];

  if (!paymentHeader) {
    const paymentRequired = await buildProductPaymentRequired(product, absoluteRequestUrl(req));
    return sendPaymentRequired(res, paymentRequired);
  }

  let paymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    const paymentRequired = await buildProductPaymentRequired(product, absoluteRequestUrl(req));
    return sendPaymentRequired(res, paymentRequired);
  }

  const settlement = await settleProductPayment(product, paymentPayload, absoluteRequestUrl(req));
  const receipt = await registerPurchase(product.id, {
    buyerAddress: settlement.payer,
    transactionDigest: settlement.transaction,
    amountMist: settlement.amount,
    via: 'agent',
  });
  res.setHeader('PAYMENT-RESPONSE', settlement.responseHeader);
  sendSealDelivery(res, product, receipt);
});

const clientDistDir = path.resolve(process.env.CLIENT_DIST_DIR || path.join(process.cwd(), 'dist/client'));
const clientIndexPath = path.join(clientDistDir, 'index.html');

if (fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistDir));
  app.get(/^(?!\/api\/|\/x402\/).*/, (_req, res) => {
    res.sendFile(clientIndexPath);
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    error instanceof HttpError
      ? error.status
      : error instanceof NativeX402Error
        ? error.status
        : error instanceof ContractError
          ? error.status
          : 500;
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  res.status(status).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`Walrus Exchange API listening on http://localhost:${config.port}`);
});

async function verifyAndRegister(
  productId: string,
  digest: string,
  buyerAddress: string | undefined,
  via: 'human' | 'agent',
) {
  const product = await requireProduct(productId);
  const existing = await getPurchaseByDigest(digest);

  if (existing) {
    if (existing.productId !== productId) {
      throw new HttpError(409, 'This Sui transaction digest has already unlocked another product.');
    }
    return existing;
  }

  const verified = await verifySuiPayment(product, digest, buyerAddress);
  return registerPurchase(product.id, {
    buyerAddress: verified.buyerAddress,
    transactionDigest: verified.transactionDigest,
    amountMist: verified.amountMist,
    receiptId: verified.receiptId,
    via,
  });
}

function sendSealDelivery(
  res: Response,
  product: Awaited<ReturnType<typeof requireProduct>>,
  receipt: Awaited<ReturnType<typeof verifyAndRegister>>,
) {
  res.json(buildSealDeliveryDescriptor(product, receipt));
}

async function requireProduct(productId: string) {
  const product = await getProduct(productId);
  if (!product) throw new HttpError(404, 'Product not found.');
  return product;
}

async function getSuiHealth() {
  try {
    return { ok: true, checkpoint: await getLatestCheckpoint() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sui RPC unavailable.' };
  }
}

function withAgentBuyUrl(req: Request, product: ProductPublic): ProductPublic {
  return {
    ...product,
    agentBuyUrl: `${req.protocol}://${req.get('host')}/x402/products/${encodeURIComponent(product.id)}/asset`,
  };
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
