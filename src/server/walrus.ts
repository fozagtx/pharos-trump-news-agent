import { config } from './config.js';

type WalrusStoreResponse = {
  newlyCreated?: {
    blobObject?: {
      id?: string;
      blobId?: string;
    };
  };
  alreadyCertified?: {
    blobId?: string;
    event?: {
      txDigest?: string;
    };
  };
};

export type WalrusUploadResult = {
  blobId: string;
  objectId?: string;
  raw: unknown;
};

export async function uploadWalrusBlob(bytes: Buffer, contentType: string): Promise<WalrusUploadResult> {
  const url = new URL('/v1/blobs', config.walrusPublisherUrl);
  url.searchParams.set('epochs', String(config.walrusEpochs));

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': contentType || 'application/octet-stream',
    },
    body: bytes,
  });

  const rawText = await response.text();
  const payload = parseJson(rawText);

  if (!response.ok) {
    throw new Error(`Walrus publisher rejected upload (${response.status}): ${rawText.slice(0, 500)}`);
  }

  const parsed = payload as WalrusStoreResponse;
  const blobId = parsed.newlyCreated?.blobObject?.blobId ?? parsed.alreadyCertified?.blobId;
  const objectId = parsed.newlyCreated?.blobObject?.id;

  if (!blobId) {
    throw new Error('Walrus publisher response did not include a blobId.');
  }

  return {
    blobId,
    objectId,
    raw: payload,
  };
}

export async function downloadWalrusBlob(blobId: string): Promise<Buffer> {
  const url = new URL(`/v1/blobs/${encodeURIComponent(blobId)}`, config.walrusAggregatorUrl);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await delay(1_500 * attempt);
    }

    const response = await fetch(url);

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    if (response.status !== 404) {
      throw new Error(`Walrus aggregator could not read blob ${blobId} (${response.status}).`);
    }
  }

  throw new Error(`Walrus aggregator could not read blob ${blobId} after propagation retries.`);
}

function parseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Walrus publisher returned non-JSON response: ${rawText.slice(0, 500)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
