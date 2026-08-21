import { Keypair } from "@stellar/stellar-sdk";

function generateAccount(label: string) {
  const kp = Keypair.random();
  return { label, publicKey: kp.publicKey(), secretKey: kp.secret() };
}

function main() {
  const seller = generateAccount("NYMOR_SELLER");
  const buyer = generateAccount("NYMOR_BUYER");

  console.log("\n=== Nymor testnet accounts generated ===\n");
  console.log(`Seller public key  (NYMOR_SELLER_PAYTO_ADDRESS): ${seller.publicKey}`);
  console.log(`Seller secret key  (keep offline, not used in .env): ${seller.secretKey}`);
  console.log(`Buyer public key   (fund + trustline this one): ${buyer.publicKey}`);
  console.log(`Buyer secret key   (NYMOR_BUYER_STELLAR_PRIVATE_KEY): ${buyer.secretKey}`);

  console.log("\n=== Next steps (must be done by a human) ===\n");
  console.log("1. Fund BOTH accounts with testnet XLM:");
  console.log("   https://lab.stellar.org/account/fund");
  console.log(`   -> paste seller public key: ${seller.publicKey}`);
  console.log(`   -> paste buyer public key:  ${buyer.publicKey}`);
  console.log("\n2. Establish a USDC trustline on BOTH accounts.");
  console.log("   Testnet USDC issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
  console.log("   Use Stellar Lab 'Change Trust' operation for each account.");
  console.log("\n3. Get testnet USDC into the BUYER account (it pays, so it needs balance):");
  console.log("   https://faucet.circle.com");
  console.log(`   -> destination: ${buyer.publicKey}`);
  console.log("\n4. Get a real ANTHROPIC_API_KEY for the /summarize resource.");
  console.log("\n5. Fill in .env from .env.example using:");
  console.log(`   NYMOR_SELLER_PAYTO_ADDRESS=${seller.publicKey}`);
  console.log(`   NYMOR_BUYER_STELLAR_PRIVATE_KEY=${buyer.secretKey}`);
  console.log("\nThe seller secret key is not needed by any running Nymor process (it only");
  console.log("receives funds) — store it somewhere safe outside the repo, not in .env.\n");
}

main();
