#!/usr/bin/env zsh
set -euo pipefail

if ! command -v sui >/dev/null 2>&1; then
  echo "Sui CLI is not installed or not on PATH."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for writing .env."
  exit 1
fi

printf "Paste runtime Sui private key, press Enter: "
IFS= read -rs RAW_KEY
printf "\n"

if [[ -z "$RAW_KEY" ]]; then
  echo "No key was entered."
  exit 1
fi

RUNTIME_KEY="$RAW_KEY"

if [[ "$RAW_KEY" != suiprivkey* ]]; then
  CONVERT_JSON="$(sui keytool convert "$RAW_KEY" --json)"
  RUNTIME_KEY="$(printf "%s" "$CONVERT_JSON" | node -e 'const fs = require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).bech32WithFlag);')"
fi

RUNTIME_KEY="$RUNTIME_KEY" node --input-type=module <<'NODE'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const envPath = '.env';
const examplePath = '.env.example';
const key = process.env.RUNTIME_KEY || '';
if (!key.startsWith('suiprivkey')) {
  console.error('Runtime key must be a Sui private key beginning with suiprivkey.');
  process.exit(1);
}

const source = existsSync(envPath)
  ? readFileSync(envPath, 'utf8')
  : existsSync(examplePath)
    ? readFileSync(examplePath, 'utf8')
    : '';

const updates = {
  SUI_OPERATOR_SECRET_KEY: key,
  X402_SUI_FACILITATOR_SECRET_KEY: key,
};
const seen = new Set();
const lines = source.split(/\r?\n/).map((line) => {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (!match || !(match[1] in updates)) return line;
  seen.add(match[1]);
  return `${match[1]}=${updates[match[1]]}`;
});

for (const [name, value] of Object.entries(updates)) {
  if (!seen.has(name)) lines.push(`${name}=${value}`);
}

writeFileSync(envPath, `${lines.join('\n').replace(/\n*$/, '')}\n`);
NODE

unset RAW_KEY RUNTIME_KEY

echo "Runtime keys written to .env. Restart npm run dev."
