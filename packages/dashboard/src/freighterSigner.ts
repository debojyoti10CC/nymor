import { signAuthEntry, signTransaction } from "@stellar/freighter-api";
import type { ClientStellarSigner } from "@x402/stellar";

// Freighter's signAuthEntry/signTransaction already match SEP-43
// (https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md)
// field-for-field — {signedAuthEntry, signerAddress} / {signedTxXdr,
// signerAddress} — which is exactly the shape @x402/stellar's
// ClientStellarSigner expects, so no adapter logic is needed beyond binding
// `address`.
export function createFreighterSigner(address: string): ClientStellarSigner {
  return {
    address,
    signAuthEntry: async (entryXdr, opts) => {
      const result = await signAuthEntry(entryXdr, { address, networkPassphrase: opts?.networkPassphrase });
      if (result.error || result.signedAuthEntry === null) {
        throw new Error(`Freighter declined to sign the auth entry: ${result.error ?? "no signature returned"}`);
      }
      return { signedAuthEntry: result.signedAuthEntry, signerAddress: result.signerAddress };
    },
    signTransaction: (transactionXdr, opts) =>
      signTransaction(transactionXdr, { address, networkPassphrase: opts?.networkPassphrase }),
  };
}
