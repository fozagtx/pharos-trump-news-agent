import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { defaultConfig } from './shared/config';

const GRPC_URLS = {
  testnet: defaultConfig.browserSuiGrpcUrl,
} as const;

export const dAppKit = createDAppKit({
  networks: ['testnet'],
  defaultNetwork: 'testnet',
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: GRPC_URLS[network] }),
  autoConnect: true,
  storage: window.localStorage,
  storageKey: 'walrus-exchange:sui-wallet',
});

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
