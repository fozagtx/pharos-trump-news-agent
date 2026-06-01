import 'dotenv/config';
import process from 'node:process';
import { defaultConfig } from '../shared/config.js';

export const config = {
  port: Number(process.env.PORT || defaultConfig.port),
  suiRpcUrl: trimTrailingSlash(process.env.SUI_RPC_URL || defaultConfig.suiRpcUrl),
  suiGrpcUrl: trimTrailingSlash(process.env.SUI_GRPC_URL || defaultConfig.suiGrpcUrl),
  tatumApiKey: (process.env.TATUM_API_KEY || '').trim(),
  walrusPublisherUrl: trimTrailingSlash(
    process.env.WALRUS_PUBLISHER_URL || defaultConfig.walrusPublisherUrl,
  ),
  walrusAggregatorUrl: trimTrailingSlash(
    process.env.WALRUS_AGGREGATOR_URL || defaultConfig.walrusAggregatorUrl,
  ),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || defaultConfig.maxUploadBytes),
  walrusEpochs: Number(process.env.WALRUS_EPOCHS || defaultConfig.walrusEpochs),
  suiPackageId: process.env.SUI_PACKAGE_ID || '',
  suiOperatorCapId: process.env.SUI_OPERATOR_CAP_ID || '',
  suiOperatorSecretKey: process.env.SUI_OPERATOR_SECRET_KEY || '',
  x402SuiFacilitatorSecretKey: process.env.X402_SUI_FACILITATOR_SECRET_KEY || '',
  sealThreshold: defaultConfig.sealThreshold,
  sealKeyServers: defaultConfig.sealKeyServers,
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
