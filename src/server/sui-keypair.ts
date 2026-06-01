import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';

export type SupportedSuiKeypair = Ed25519Keypair | Secp256k1Keypair | Secp256r1Keypair;

export function keypairFromSuiSecret(value: string): SupportedSuiKeypair {
  const decoded = decodeSuiPrivateKey(value);
  if (decoded.scheme === 'ED25519') return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  if (decoded.scheme === 'Secp256k1') return Secp256k1Keypair.fromSecretKey(decoded.secretKey);
  if (decoded.scheme === 'Secp256r1') return Secp256r1Keypair.fromSecretKey(decoded.secretKey);
  throw new Error(`Unsupported Sui key scheme: ${decoded.scheme}`);
}
