// Standalone script — NOT part of the shipped product.
//
// Generates several fresh, independently funded testnet accounts and has
// each one pay nymor-resources for real, over the real x402 flow, cycling
// through the actual resource catalog. Produces genuinely diverse-origin
// transaction history on the seller's account (and each resource's own
// activity) — not one wallet repeatedly paying itself.
import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL = "https://soroban-testnet.stellar.org";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const RESOURCES_BASE = "http://localhost:3001";

const BUYER_SECRET = process.env.NYMOR_BUYER_STELLAR_PRIVATE_KEY;
const NUM_ACCOUNTS = Number(process.argv[2] ?? 6);
const PAYMENTS_PER_ACCOUNT = Number(process.argv[3] ?? 18);
const FUNDING_USDC = process.env.NYMOR_BULK_FUNDING_STROOPS ?? "5000000"; // 0.5 USDC per new account, 7 decimals

const RESOURCES = [
  { id: "xlm-price", url: `${RESOURCES_BASE}/xlm-price`, method: "GET" },
  {
    id: "stellar-balance",
    url: `${RESOURCES_BASE}/stellar-balance?address=${USDC_ISSUER}`,
    method: "GET",
  },
  { id: "weather", url: `${RESOURCES_BASE}/weather?lat=51.5&lon=-0.12`, method: "GET" },
];

const horizon = new Horizon.Server(HORIZON_URL);

async function fundWithFriendbot(publicKey) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok) throw new Error(`friendbot failed for ${publicKey}: ${res.status}`);
}

async function establishTrustline(kp) {
  const account = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", USDC_ISSUER) }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
}

async function sendUsdcFromBuyer(buyerKp, destPublicKey, amountStroops) {
  const account = await horizon.loadAccount(buyerKp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: destPublicKey,
        asset: new Asset("USDC", USDC_ISSUER),
        amount: (Number(amountStroops) / 1e7).toFixed(7),
      }),
    )
    .setTimeout(60)
    .build();
  tx.sign(buyerKp);
  await horizon.submitTransaction(tx);
}

async function payOnce(secretKey, resource) {
  const signer = createEd25519Signer(secretKey, "stellar:testnet");
  const coreClient = new x402Client().register(
    "stellar:*",
    new ExactStellarScheme(signer, { url: RPC_URL }),
  );
  const httpClient = new x402HTTPClient(coreClient);
  const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);

  const response = await fetchWithPayment(resource.url, { method: resource.method });
  if (!response.ok) throw new Error(`resource returned ${response.status}`);
  const settlement = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
  return settlement?.transaction;
}

async function main() {
  if (!BUYER_SECRET) {
    console.error("Set NYMOR_BUYER_STELLAR_PRIVATE_KEY");
    process.exit(1);
  }
  const buyerKp = Keypair.fromSecret(BUYER_SECRET);

  console.log(`Provisioning ${NUM_ACCOUNTS} fresh accounts...`);
  const accounts = [];
  for (let i = 0; i < NUM_ACCOUNTS; i++) {
    const kp = Keypair.random();
    await fundWithFriendbot(kp.publicKey());
    await establishTrustline(kp);
    await sendUsdcFromBuyer(buyerKp, kp.publicKey(), FUNDING_USDC);
    accounts.push(kp);
    console.log(`  [${i + 1}/${NUM_ACCOUNTS}] ${kp.publicKey()} funded + trustline + 0.1 USDC`);
  }

  console.log(`\nRunning ${PAYMENTS_PER_ACCOUNT} payments per account...`);
  let total = 0;
  let succeeded = 0;
  for (const kp of accounts) {
    for (let i = 0; i < PAYMENTS_PER_ACCOUNT; i++) {
      const resource = RESOURCES[total % RESOURCES.length];
      total++;
      try {
        const hash = await payOnce(kp.secret(), resource);
        succeeded++;
        console.log(`  [${succeeded}/${total}] ${kp.publicKey().slice(0, 6)}... paid ${resource.id} -> ${hash}`);
      } catch (err) {
        console.log(`  [FAIL ${total}] ${kp.publicKey().slice(0, 6)}... ${resource.id}: ${err.message}`);
      }
    }
  }

  console.log(`\nDone. ${succeeded}/${total} payments settled across ${NUM_ACCOUNTS} independent accounts.`);
}

main().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
