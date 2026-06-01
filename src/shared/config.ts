export const defaultConfig = {
  port: 8787,
  apiBaseUrl: 'http://localhost:8787',
  publicAppUrl: 'https://walaxy.onrender.com',
  publicCatalogUrl: 'https://walaxy.onrender.com/api/products',
  suiRpcUrl: 'https://sui-testnet.gateway.tatum.io',
  suiGrpcUrl: 'https://fullnode.testnet.sui.io:443',
  browserSuiGrpcUrl: 'https://fullnode.testnet.sui.io:443',
  walrusPublisherUrl: 'https://publisher.walrus-testnet.walrus.space',
  walrusAggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
  maxUploadBytes: 10_000_000,
  walrusEpochs: 5,
  agentOutputDir: 'downloads',
  sealThreshold: 1,
  sealKeyServers: [
    {
      objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
      weight: 1,
      aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
    },
  ],
} as const;
