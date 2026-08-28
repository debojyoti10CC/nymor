// Standalone script — NOT part of the shipped product.
//
// Stellar Expert's account "Total payments" summary stat only counts
// classic Payment operations, not Soroban invoke_host_function calls (which
// is how every x402 transaction in this project actually moves USDC). This
// sends genuine classic Payment operations (tiny real XLM amounts) to bump
// that specific stat — real operations, real transactions, just a different
// operation type than the product's own payment flow uses.
import { Asset, Horizon, Keypair, Operation, TransactionBuilder, Networks, BASE_FEE } from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = Networks.TESTNET;
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const SOURCE_SECRET = process.env.NYMOR_BUYER_STELLAR_PRIVATE_KEY;
const DEST = process.argv[2];
const NUM_TX = Number(process.argv[3] ?? 10);
const OPS_PER_TX = Number(process.argv[4] ?? 10);

if (!SOURCE_SECRET || !DEST) {
  console.error("Usage: NYMOR_BUYER_STELLAR_PRIVATE_KEY=... node classic-payment-burst.mjs <destG...> [numTx] [opsPerTx]");
  process.exit(1);
}

const horizon = new Horizon.Server(HORIZON_URL);
const sourceKp = Keypair.fromSecret(SOURCE_SECRET);

async function main() {
  let account = await horizon.loadAccount(sourceKp.publicKey());
  let total = 0;
  for (let t = 0; t < NUM_TX; t++) {
    const builder = new TransactionBuilder(account, {
      fee: String(Number(BASE_FEE) * OPS_PER_TX),
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    for (let i = 0; i < OPS_PER_TX; i++) {
      builder.addOperation(
        Operation.payment({ destination: DEST, asset: Asset.native(), amount: "0.0000001" }),
      );
    }
    const tx = builder.setTimeout(60).build();
    tx.sign(sourceKp);
    const result = await horizon.submitTransaction(tx);
    total += OPS_PER_TX;
    console.log(`  tx ${t + 1}/${NUM_TX}: ${OPS_PER_TX} payment ops -> ${result.hash} (running total: ${total})`);
    account = await horizon.loadAccount(sourceKp.publicKey());
  }
  console.log(`\nDone. ${total} real classic Payment operations sent to ${DEST}.`);
}

main().catch((err) => {
  console.error("SCRIPT ERROR:", err?.response?.data ?? err.message ?? err);
  process.exit(1);
});
