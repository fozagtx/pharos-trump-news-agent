#!/usr/bin/env zsh
set -euo pipefail

if ! command -v sui >/dev/null 2>&1; then
  echo "Sui CLI is not installed or not on PATH."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required for JSON parsing."
  exit 1
fi

ALIAS="${1:-walrus-deployer-$(date +%s)}"
SCHEME="${SUI_KEY_SCHEME:-ed25519}"

printf "Paste existing Sui key or recovery phrase, press Enter: "
IFS= read -rs RAW_KEY
printf "\n"

if [[ -z "$RAW_KEY" ]]; then
  echo "No key was entered."
  exit 1
fi

IMPORT_KEY="$RAW_KEY"

if [[ "$RAW_KEY" != suiprivkey* ]]; then
  if CONVERT_JSON="$(sui keytool convert "$RAW_KEY" --json 2>/dev/null)"; then
    IMPORT_KEY="$(printf "%s" "$CONVERT_JSON" | node -e 'const fs = require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).bech32WithFlag);')"
    SCHEME="$(printf "%s" "$CONVERT_JSON" | node -e 'const fs = require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0, "utf8")).scheme.toLowerCase());')"
  fi
fi

sui keytool import "$IMPORT_KEY" "$SCHEME" --alias "$ALIAS"
unset RAW_KEY IMPORT_KEY

sui client switch --env testnet
sui client switch --address "$ALIAS"

echo
echo "Imported and selected:"
sui client active-address
echo
echo "Now deploy with:"
echo "npm run deploy:contract"
