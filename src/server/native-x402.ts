import { fromBase64 } from '@mysten/sui/utils';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Request, Response as ExpressResponse } from 'express';
import { ExactSuiScheme as ExactSuiClientScheme } from '@tentaclepay/sui-x402/exact/client';
import { ExactSuiScheme as ExactSuiFacilitatorScheme } from '@tentaclepay/sui-x402/exact/facilitator';
import { ExactSuiScheme as ExactSuiServerScheme } from '@tentaclepay/sui-x402/exact/server';
import { createSuiClientRegistry, toFacilitatorSuiSigner } from '@tentaclepay/sui-x402';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { x402Facilitator } from '@x402/core/facilitator';
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SupportedResponse } from '@x402/core/types';
import type { ProductRecord } from './catalog.js';
import { config } from './config.js';
import { keypairFromSuiSecret, type SupportedSuiKeypair } from './sui-keypair.js';

const X402_NETWORK = 'sui:testnet';
const SUI_ASSET = '0x2::sui::SUI';

type NativeX402Stack = {
  resourceServer: x402ResourceServer;
};

let stackPromise: Promise<NativeX402Stack> | null = null;

export function isNativeX402Configured(): boolean {
  return Boolean(config.x402SuiFacilitatorSecretKey);
}

export async function getNativeX402Stack(): Promise<NativeX402Stack> {
  if (!stackPromise) {
    stackPromise = createNativeX402Stack();
  }
  return stackPromise;
}

export async function buildProductPaymentRequired(product: ProductRecord, resourceUrl: string): Promise<PaymentRequired> {
  const { resourceServer } = await getNativeX402Stack();
  const requirements = await buildProductRequirements(resourceServer, product);

  return resourceServer.createPaymentRequiredResponse(
    requirements,
    {
      url: resourceUrl,
      description: `Purchase ${product.title} on Walrus Exchange`,
      mimeType: product.fileType || 'application/octet-stream',
      serviceName: 'Walrus Exchange',
      tags: ['sui', 'walrus', 'x402'],
    },
    'Payment required',
  );
}

export async function settleProductPayment(
  product: ProductRecord,
  paymentPayload: PaymentPayload,
  resourceUrl: string,
): Promise<{ payer: string; transaction: string; amount: string; responseHeader: string }> {
  const { resourceServer } = await getNativeX402Stack();
  const paymentRequired = await buildProductPaymentRequired(product, resourceUrl);
  const requirements = resourceServer.findMatchingRequirements(paymentRequired.accepts, paymentPayload);

  if (!requirements) {
    throw new NativeX402Error(402, 'No matching native Sui x402 payment requirement.');
  }

  const verifyResult = await resourceServer.verifyPayment(paymentPayload, requirements);
  if (!verifyResult.isValid) {
    throw new NativeX402Error(402, verifyResult.invalidMessage || verifyResult.invalidReason || 'Payment verification failed.');
  }

  const settleResult = await resourceServer.settlePayment(paymentPayload, requirements);
  if (!settleResult.success || !settleResult.transaction) {
    throw new NativeX402Error(402, settleResult.errorMessage || settleResult.errorReason || 'Payment settlement failed.');
  }

  return {
    payer: settleResult.payer || verifyResult.payer || '',
    transaction: settleResult.transaction,
    amount: requirements.amount,
    responseHeader: encodePaymentResponseHeader(settleResult),
  };
}

export async function createNativePaymentHeader(targetUrl: string, keypair: SupportedSuiKeypair): Promise<string> {
  const response = await fetch(targetUrl);
  return createNativePaymentHeaderFromResponse(response, keypair);
}

export async function createNativePaymentHeaderFromResponse(
  response: globalThis.Response,
  keypair: SupportedSuiKeypair,
): Promise<string> {
  const httpClient = createNativeX402HttpClient(keypair);
  if (response.status !== 402) {
    throw new NativeX402Error(response.status, `Expected 402 Payment Required, got ${response.status}.`);
  }

  const body = await safeJson(response);
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    body,
  );
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  return httpClient.encodePaymentSignatureHeader(paymentPayload)['PAYMENT-SIGNATURE'];
}

export function createNativeX402HttpClient(keypair: SupportedSuiKeypair): x402HTTPClient {
  const clientRegistry = createSuiClientRegistry();
  clientRegistry.set(X402_NETWORK, new SuiGrpcClient({ network: 'testnet', baseUrl: config.suiRpcUrl }));
  const clientSigner = {
    address: `0x${keypair.toSuiAddress().replace(/^0x/, '')}` as `0x${string}`,
    signTransaction: async (bytes: string) => (await keypair.signTransaction(fromBase64(bytes))).signature,
  };
  const client = new x402Client().register(
    X402_NETWORK,
    new ExactSuiClientScheme(clientSigner, { clientRegistry }),
  );
  return new x402HTTPClient(client);
}

export function sendPaymentRequired(res: ExpressResponse, paymentRequired: PaymentRequired) {
  res.setHeader('PAYMENT-REQUIRED', encodePaymentRequiredHeader(paymentRequired));
  res.status(402).json(paymentRequired);
}

export function absoluteRequestUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

async function createNativeX402Stack(): Promise<NativeX402Stack> {
  if (!config.x402SuiFacilitatorSecretKey) {
    throw new NativeX402Error(503, 'Native Sui x402 requires X402_SUI_FACILITATOR_SECRET_KEY.');
  }

  const facilitatorKeypair = keypairFromSuiSecret(config.x402SuiFacilitatorSecretKey);
  const clientRegistry = createSuiClientRegistry();
  clientRegistry.set(X402_NETWORK, new SuiGrpcClient({ network: 'testnet', baseUrl: config.suiRpcUrl }));

  const facilitatorSigner = toFacilitatorSuiSigner({
    address: `0x${facilitatorKeypair.toSuiAddress().replace(/^0x/, '')}` as `0x${string}`,
    signTransaction: async (bytes) => (await facilitatorKeypair.signTransaction(fromBase64(bytes))).signature,
  });

  const facilitator = new x402Facilitator().register(
    X402_NETWORK,
    new ExactSuiFacilitatorScheme(facilitatorSigner, { clientRegistry }),
  );
  const facilitatorClient: FacilitatorClient = {
    getSupported: async () => facilitator.getSupported() as SupportedResponse,
    verify: (paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements) =>
      facilitator.verify(paymentPayload, paymentRequirements),
    settle: (paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements) =>
      facilitator.settle(paymentPayload, paymentRequirements),
  };

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    X402_NETWORK,
    new ExactSuiServerScheme(),
  );
  await resourceServer.initialize();

  return {
    resourceServer,
  };
}

async function buildProductRequirements(
  resourceServer: x402ResourceServer,
  product: ProductRecord,
): Promise<PaymentRequirements[]> {
  return resourceServer.buildPaymentRequirements({
    scheme: 'exact',
    network: X402_NETWORK,
    payTo: product.sellerAddress,
    price: {
      asset: SUI_ASSET,
      amount: product.priceMist,
      extra: {
        productId: product.id,
        manifestBlobId: product.manifestBlobId,
        encryptedBlobId: product.encryptedBlobId,
      },
    },
    maxTimeoutSeconds: 300,
    extra: {
      productId: product.id,
      manifestBlobId: product.manifestBlobId,
      encryptedBlobId: product.encryptedBlobId,
    },
  });
}

async function safeJson(response: globalThis.Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export class NativeX402Error extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
