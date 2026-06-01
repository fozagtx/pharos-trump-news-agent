import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createNativePaymentHeaderFromResponse } from '../server/native-x402.js';
import { decryptSealDelivery } from '../server/seal.js';
import { keypairFromSuiSecret } from '../server/sui-keypair.js';
import { defaultConfig } from '../shared/config.js';
import type { SealDeliveryDescriptor } from '../shared/types.js';

const targetUrl = process.argv[2];
const secretKey = process.env.AGENT_SUI_SECRET_KEY;
const outputDir = process.env.AGENT_OUTPUT_DIR || defaultConfig.agentOutputDir;

if (!targetUrl) {
  throw new Error('Usage: AGENT_SUI_SECRET_KEY=<key> npm run agent:buy -- <x402-url>');
}

if (!secretKey) {
  throw new Error('AGENT_SUI_SECRET_KEY is required.');
}

const keypair = keypairFromSuiSecret(secretKey);
const initialResponse = await fetch(targetUrl);

if (initialResponse.status !== 402) {
  await saveResponse(initialResponse, targetUrl);
  process.exit(0);
}

const paymentSignature = await createNativePaymentHeaderFromResponse(initialResponse, keypair);

const paidResponse = await fetch(targetUrl, {
  headers: {
    'PAYMENT-SIGNATURE': paymentSignature,
  },
});

await saveResponse(paidResponse, targetUrl);

async function saveResponse(response: Response, url: string) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paid fetch failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (isSealDeliveryDescriptor(payload)) {
      const plaintext = await decryptSealDelivery(payload, keypair);
      const outputPath = path.resolve(outputDir, safeFileName(payload.fileName));
      await fs.writeFile(outputPath, plaintext);
      console.log(`Saved decrypted Seal asset to ${outputPath}`);
      return;
    }

    const outputPath = path.resolve(outputDir, `${new URL(url).pathname.split('/').filter(Boolean).join('-')}.json`);
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Saved JSON response to ${outputPath}`);
    return;
  }

  const fileName = fileNameFromResponse(response) || `${new URL(url).pathname.split('/').filter(Boolean).join('-')}.bin`;
  const outputPath = path.resolve(outputDir, fileName);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved paid asset to ${outputPath}`);
}

function fileNameFromResponse(response: Response): string | null {
  const disposition = response.headers.get('content-disposition');
  const quoted = disposition?.match(/filename="([^"]+)"/)?.[1];
  return quoted ? safeFileName(quoted) : null;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\- ]+/g, '_').slice(0, 140) || 'asset.bin';
}

function isSealDeliveryDescriptor(value: unknown): value is SealDeliveryDescriptor {
  if (!value || typeof value !== 'object') return false;
  const delivery = value as Partial<SealDeliveryDescriptor>;
  return delivery.mode === 'seal' && typeof delivery.encryptedBlobId === 'string' && Boolean(delivery.seal?.receiptId);
}
