import { ChannelCredentials } from '@grpc/grpc-js';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { config } from './config.js';

const TATUM_GATEWAY_HOST = 'gateway.tatum.io';

type JsonRpcResponse<T> = {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

type JsonRpcAttempt<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: SuiJsonRpcError;
    };

export function createSuiGrpcClient(): SuiGrpcClient {
  if (isTatumGrpcUrl(config.suiGrpcUrl)) {
    const meta = tatumMetadata();

    return new SuiGrpcClient({
      network: 'testnet',
      transport: new GrpcTransport({
        host: grpcHost(config.suiGrpcUrl),
        channelCredentials: ChannelCredentials.createSsl(),
        ...(meta ? { meta } : {}),
      }),
    });
  }

  return new SuiGrpcClient({
    network: 'testnet',
    baseUrl: config.suiGrpcUrl,
  });
}

export async function suiJsonRpc<T>(method: string, params: unknown[]): Promise<T> {
  const primary = await trySuiJsonRpc<T>('primary', config.suiRpcUrl, method, params);
  if (primary.ok) return primary.result;

  if (shouldTryTatumFallback(primary.error)) {
    const fallback = await trySuiJsonRpc<T>('tatum-fallback', config.tatumRpcUrl, method, params);
    if (fallback.ok) return fallback.result;

    throw new SuiJsonRpcError(
      method,
      config.tatumRpcUrl,
      `Primary Sui RPC failed (${primary.error.message}); Tatum fallback failed (${fallback.error.message}).`,
      fallback.error.status,
      fallback.error.provider,
      fallback.error.retryable,
    );
  }

  throw primary.error;
}

function suiJsonRpcHeaders(url: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(isTatumRpcUrl(url) && config.tatumApiKey ? { 'x-api-key': config.tatumApiKey } : {}),
  };
}

function tatumMetadata(): Record<string, string> | undefined {
  return config.tatumApiKey ? { 'x-api-key': config.tatumApiKey } : undefined;
}

async function trySuiJsonRpc<T>(
  provider: 'primary' | 'tatum-fallback',
  url: string,
  method: string,
  params: unknown[],
): Promise<JsonRpcAttempt<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: suiJsonRpcHeaders(url),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (!response.ok || payload.error) {
      const message = payload.error?.message || `Sui RPC ${method} failed with ${response.status}.`;
      return {
        ok: false,
        error: new SuiJsonRpcError(method, url, message, response.status, provider, isRetryableStatus(response.status)),
      };
    }

    if (payload.result === undefined) {
      return {
        ok: false,
        error: new SuiJsonRpcError(method, url, `Sui RPC ${method} did not return a result.`, response.status, provider, false),
      };
    }

    return { ok: true, result: payload.result };
  } catch (error) {
    return {
      ok: false,
      error: new SuiJsonRpcError(
        method,
        url,
        error instanceof Error ? error.message : `Sui RPC ${method} request failed.`,
        undefined,
        provider,
        true,
      ),
    };
  }
}

function shouldTryTatumFallback(error: SuiJsonRpcError): boolean {
  return Boolean(config.tatumApiKey && config.tatumRpcUrl && !isTatumRpcUrl(error.url) && error.retryable);
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

function isTatumGrpcUrl(value: string): boolean {
  return grpcHost(value).endsWith(TATUM_GATEWAY_HOST);
}

function isTatumRpcUrl(value: string): boolean {
  try {
    return new URL(value).host.endsWith(TATUM_GATEWAY_HOST);
  } catch {
    return value.includes(TATUM_GATEWAY_HOST);
  }
}

function grpcHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

export class SuiJsonRpcError extends Error {
  constructor(
    public readonly method: string,
    public readonly url: string,
    message: string,
    public readonly status: number | undefined,
    public readonly provider: 'primary' | 'tatum-fallback',
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
