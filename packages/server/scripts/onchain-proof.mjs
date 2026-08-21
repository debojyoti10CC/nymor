// Standalone verification script — NOT part of the shipped product.
//
// Submits a real transaction through nymor-account's custom __check_auth on
// Stellar testnet: a SAC `transfer` where `from` is the smart-account
// contract itself, so the network requires a signature authenticated
// against nymor-account's Signer::Delegated(buyer) + spending-limit policy,
// not a plain classic-account signature.
//
// This is genuinely off the beaten path: @x402/stellar (and stellar-sdk's
// own `authorizeEntry` helper) only know how to build the classic
// `{public_key, signature}` credential shape. OZ smart accounts require
// signing a custom digest — auth_digest = sha256(signature_payload ||
// context_rule_ids.to_xdr()) — and wrapping the signature in an
// `AuthPayload{signers: Map<Signer,Bytes>, context_rule_ids: Vec<u32>}`
// ScVal structure. Both are built here by hand at the XDR level, matching
// stellar_accounts::smart_account::storage::do_check_auth exactly (see
// .refs/stellar-contracts/packages/accounts/src/smart_account/storage.rs).
import {
  Address,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
  hash,
  BASE_FEE,
  Operation,
} from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const NYMOR_ACCOUNT = "CAF2HV5N57UDZOMGD2WC4BI472Z3CRSQYQ2V4AKPPP5W4PD4HC4LBKVW";
const CONTEXT_RULE_ID = 0;

const feePayerSecret = process.env.NYMOR_FEE_PAYER_SECRET;
const buyerSecret = process.env.NYMOR_BUYER_STELLAR_PRIVATE_KEY;
const amount = process.argv[2];
const destination = process.argv[3];

if (!feePayerSecret || !buyerSecret || !amount || !destination) {
  console.error(
    "Usage: NYMOR_FEE_PAYER_SECRET=... NYMOR_BUYER_STELLAR_PRIVATE_KEY=... node onchain-proof.mjs <amount_stroops> <destination_G_address>",
  );
  process.exit(1);
}

const server = new rpc.Server(RPC_URL);
const feePayerKp = Keypair.fromSecret(feePayerSecret);
const buyerKp = Keypair.fromSecret(buyerSecret);

function buildTransferOp() {
  const hostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(USDC_SAC).toScAddress(),
      functionName: "transfer",
      args: [
        nativeToScVal(NYMOR_ACCOUNT, { type: "address" }),
        nativeToScVal(destination, { type: "address" }),
        nativeToScVal(amount, { type: "i128" }),
      ],
    }),
  );
  return { hostFunction, op: Operation.invokeHostFunction({ func: hostFunction, auth: [] }) };
}

/** AuthPayload{context_rule_ids: Vec<u32>, signers: Map<Signer,Bytes>} as an ScVal. */
function buildAuthPayloadScVal(contextRuleId, authDigestSignature) {
  const signerScVal = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Delegated"),
    new Address(buyerKp.publicKey()).toScVal(),
  ]);
  const contextRuleIdsScVal = xdr.ScVal.scvVec([xdr.ScVal.scvU32(contextRuleId)]);
  const signersMapScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: signerScVal, val: xdr.ScVal.scvBytes(authDigestSignature) }),
  ]);
  const authPayloadScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: contextRuleIdsScVal }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signers"), val: signersMapScVal }),
  ]);
  return { contextRuleIdsScVal, authPayloadScVal };
}

async function main() {
  const { hostFunction, op } = buildTransferOp();
  const account = await server.getAccount(feePayerKp.publicKey());

  const simTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(simTx);
  if (rpc.Api.isSimulationError(sim)) {
    console.log(JSON.stringify({ status: "SIMULATION_REJECTED", error: sim.error }, null, 2));
    return;
  }

  const authEntries = sim.result?.auth ?? [];
  const latestLedger = await server.getLatestLedger();
  const expirationLedger = latestLedger.sequence + 100;
  const networkId = hash(Buffer.from(NETWORK_PASSPHRASE));

  let authDigestForDelegatedEntry = null;

  const signedAuthEntries = authEntries.map((entry) => {
    if (entry.credentials().switch().name !== "sorobanCredentialsAddress") return entry;
    const addrCred = entry.credentials().address();
    if (Address.fromScAddress(addrCred.address()).toString() !== NYMOR_ACCOUNT) return entry;

    addrCred.signatureExpirationLedger(expirationLedger);

    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId,
        nonce: addrCred.nonce(),
        invocation: entry.rootInvocation(),
        signatureExpirationLedger: addrCred.signatureExpirationLedger(),
      }),
    );
    const signaturePayload = hash(preimage.toXDR());

    const { contextRuleIdsScVal } = buildAuthPayloadScVal(CONTEXT_RULE_ID, Buffer.alloc(0));
    const authDigest = hash(Buffer.concat([signaturePayload, contextRuleIdsScVal.toXDR()]));
    const authDigestSignature = buyerKp.sign(authDigest);
    authDigestForDelegatedEntry = authDigest;

    const { authPayloadScVal } = buildAuthPayloadScVal(CONTEXT_RULE_ID, authDigestSignature);
    addrCred.signature(authPayloadScVal);
    return entry;
  });

  // Signer::Delegated(buyer) authenticates via
  // `buyer.require_auth_for_args((auth_digest,))`, called *inside*
  // nymor-account's __check_auth. Per the host's auth.rs
  // (`AuthStackFrame::to_authorized_function`), this is matched against a
  // *second*, separate top-level auth entry for the buyer's own classic
  // account, whose invocation is `ContractFn(contract=nymor-account,
  // function="__check_auth", args=[auth_digest])` — the current call-stack
  // frame at the moment require_auth_for_args runs, not a "real" contract
  // call. OZ's own docs confirm this can't be discovered by simulation
  // ("requires manual authorization entry crafting, because it is not
  // returned in a simulation mode") — found the exact shape by reading
  // soroban-env-host's auth.rs and account_contract.rs source directly.
  if (authDigestForDelegatedEntry) {
    const delegatedNonce = xdr.Int64.fromString(String(BigInt(Math.floor(Math.random() * 1e15)) + 1n));
    const delegatedInvocation = new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(NYMOR_ACCOUNT).toScAddress(),
          functionName: "__check_auth",
          args: [xdr.ScVal.scvBytes(authDigestForDelegatedEntry)],
        }),
      ),
      subInvocations: [],
    });
    const delegatedPreimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId,
        nonce: delegatedNonce,
        invocation: delegatedInvocation,
        signatureExpirationLedger: expirationLedger,
      }),
    );
    const delegatedPayload = hash(delegatedPreimage.toXDR());
    const delegatedSignature = buyerKp.sign(delegatedPayload);
    const delegatedSigScVal = nativeToScVal(
      { public_key: buyerKp.rawPublicKey(), signature: delegatedSignature },
      { type: { public_key: ["symbol", null], signature: ["symbol", null] } },
    );

    const delegatedEntry = new xdr.SorobanAuthorizationEntry({
      rootInvocation: delegatedInvocation,
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: Address.fromString(buyerKp.publicKey()).toScAddress(),
          nonce: delegatedNonce,
          signatureExpirationLedger: expirationLedger,
          signature: xdr.ScVal.scvVec([delegatedSigScVal]),
        }),
      ),
    });
    signedAuthEntries.push(delegatedEntry);
  }

  const finalOp = Operation.invokeHostFunction({ func: hostFunction, auth: signedAuthEntries });
  const account2 = await server.getAccount(feePayerKp.publicKey());
  let finalTx = new TransactionBuilder(account2, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(finalOp)
    .setTimeout(60)
    .build();

  // Optional sanity-check simulation with the real signature attached. Its
  // resource/fee estimate is NOT used for assembly (assembleTransaction
  // below reuses `sim`'s footprint instead, from the plain discovery pass —
  // valid either way since the footprint, which storage keys get touched,
  // doesn't depend on the transfer amount). Deliberately not short-circuited
  // on error: for the over-cap case we *want* to force real submission so
  // the rejection is a genuine on-chain failed transaction with its own tx
  // hash, not just a client-side simulation result.
  const sim2 = await server.simulateTransaction(finalTx);
  if (rpc.Api.isSimulationError(sim2)) {
    console.log("Pre-submit simulation predicts rejection (submitting anyway to get a real on-chain tx):");
    console.log(sim2.error);
  }

  finalTx = rpc.assembleTransaction(finalTx, sim).build();
  finalTx.sign(feePayerKp);

  const sendResult = await server.sendTransaction(finalTx);
  console.log(
    JSON.stringify(
      {
        submitted: sendResult.status,
        hash: sendResult.hash,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`,
      },
      null,
      2,
    ),
  );
  if (sendResult.status !== "PENDING") {
    console.log(JSON.stringify({ status: "SUBMIT_FAILED", sendResult }, null, 2));
    return;
  }

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const getResult = await server.getTransaction(sendResult.hash);
      if (getResult.status !== "NOT_FOUND") {
        console.log(JSON.stringify({ status: getResult.status }, null, 2));
        return;
      }
    } catch (err) {
      console.log("getTransaction parse error (SDK/protocol skew) — check Horizon directly:", err.message);
      return;
    }
  }
  console.log("Timed out waiting for confirmation — check the explorer link above directly.");
}

main().catch((err) => {
  console.error("SCRIPT ERROR:", err?.response?.data ?? err);
  process.exit(1);
});
