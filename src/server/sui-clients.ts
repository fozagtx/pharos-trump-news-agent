import { ChannelCredentials } from '@grpc/grpc-js';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { config } from './config.js';

const TATUM_GATEWAY_HOST = 'gateway.tatum.io';

export function createSuiGrpcClient(): SuiGrpcClient {
  const meta = tatumMetadata();

  if (isTatumGrpcUrl(config.suiGrpcUrl)) {
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
    ...(meta ? { meta } : {}),
  });
}

export function suiJsonRpcHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(config.tatumApiKey ? { 'x-api-key': config.tatumApiKey } : {}),
  };
}

function tatumMetadata(): Record<string, string> | undefined {
  return config.tatumApiKey ? { 'x-api-key': config.tatumApiKey } : undefined;
}

function isTatumGrpcUrl(value: string): boolean {
  return grpcHost(value).endsWith(TATUM_GATEWAY_HOST);
}

function grpcHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}
