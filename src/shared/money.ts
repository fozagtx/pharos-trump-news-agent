export const MIST_PER_SUI = 1_000_000_000n;

export function parseSuiToMist(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(trimmed)) {
    throw new Error('Use a SUI amount with up to 9 decimal places.');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = fraction.padEnd(9, '0');
  const mist = BigInt(whole) * MIST_PER_SUI + BigInt(paddedFraction || '0');

  if (mist <= 0n) {
    throw new Error('Price must be greater than zero.');
  }

  return mist.toString();
}

export function formatMistAsSui(mistValue: string): string {
  const mist = BigInt(mistValue);
  const whole = mist / MIST_PER_SUI;
  const fraction = (mist % MIST_PER_SUI).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function shortenAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
