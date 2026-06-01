#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');
const packagePath = 'move/walrus_exchange';
const latestDeploymentPath = path.join(rootDir, 'deployments', 'latest.publish.json');

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    ...options,
  });

  if (result.error?.code === 'ENOENT') {
    die(
      'Sui CLI is not installed or not on PATH. Install/configure `sui`, switch it to Testnet, then run this command again.',
    );
  }

  if (result.error) {
    die(`${command} failed: ${result.error.message}`);
  }

  if (result.status !== 0 && !options.allowFailure) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    die(output || `${command} exited with code ${result.status}`);
  }

  return result;
}

function readEnvText() {
  if (existsSync(envPath)) return readFileSync(envPath, 'utf8');
  if (existsSync(envExamplePath)) return readFileSync(envExamplePath, 'utf8');
  return '';
}

function updateEnvFile(updates) {
  const sourceText = readEnvText();
  const seen = new Set();
  const lines = sourceText.split(/\r?\n/);
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }

  writeFileSync(envPath, `${nextLines.join('\n').replace(/\n*$/, '')}\n`);
}

function readJsonFromCliOutput(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    die('Sui publish did not return JSON. Re-run with `sui client publish ... --json` and inspect the output.');
  }

  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch (error) {
    die(`Could not parse Sui publish JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractPublishedIds(result) {
  const objectChanges = Array.isArray(result.objectChanges) ? result.objectChanges : [];
  const published = objectChanges.find((change) => change?.type === 'published' && change.packageId);
  const operatorCap = objectChanges.find(
    (change) =>
      change?.type === 'created' &&
      typeof change.objectType === 'string' &&
      change.objectType.includes('::marketplace::OperatorCap') &&
      change.objectId,
  );

  if (!published?.packageId) {
    die('Publish succeeded, but no published package id was found in Sui objectChanges.');
  }
  if (!operatorCap?.objectId) {
    die('Publish succeeded, but no marketplace::OperatorCap object id was found in Sui objectChanges.');
  }

  return {
    packageId: published.packageId,
    operatorCapId: operatorCap.objectId,
  };
}

const activeEnv = run('sui', ['client', 'active-env'], { allowFailure: true }).stdout.trim();
if (activeEnv && !activeEnv.toLowerCase().includes('testnet') && process.env.ALLOW_NON_TESTNET !== '1') {
  die(
    `Sui CLI active environment is "${activeEnv}", not Testnet. Switch to Testnet or set ALLOW_NON_TESTNET=1 if this is deliberate.`,
  );
}

const activeAddress = run('sui', ['client', 'active-address']).stdout.trim();
if (!activeAddress) {
  die('Sui CLI has no active address. Import/select a funded Testnet wallet in Sui CLI, then run this command again.');
}

const gasBudget = process.env.SUI_PUBLISH_GAS_BUDGET || '100000000';
console.log(`Publishing ${packagePath} to Sui ${activeEnv || 'current env'} as ${activeAddress}...`);

const publish = run('sui', ['client', 'publish', packagePath, '--gas-budget', gasBudget, '--json']);
const publishJson = readJsonFromCliOutput(publish.stdout);
const { packageId, operatorCapId } = extractPublishedIds(publishJson);

mkdirSync(path.dirname(latestDeploymentPath), { recursive: true });
writeFileSync(latestDeploymentPath, `${JSON.stringify(publishJson, null, 2)}\n`);

const updates = {
  SUI_PACKAGE_ID: packageId,
  SUI_OPERATOR_CAP_ID: operatorCapId,
};

updateEnvFile(updates);

console.log('\nDeployment written to .env');
console.log(`SUI_PACKAGE_ID=${packageId}`);
console.log(`SUI_OPERATOR_CAP_ID=${operatorCapId}`);
console.log(`Publisher address: ${activeAddress}`);
console.log(`Publish JSON: ${path.relative(rootDir, latestDeploymentPath)}`);
console.log('No private keys were written.');
console.log('\nRestart the API server so it reads the new .env values.');
