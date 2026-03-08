import algosdk from "algosdk";

export function getSenderAddress(txn) {
  if (txn.from) {
    if (typeof txn.from === "string") return txn.from;
    if (txn.from.publicKey instanceof Uint8Array) {
      return algosdk.encodeAddress(txn.from.publicKey);
    }
    if (txn.from instanceof Uint8Array && txn.from.length === 32) {
      return algosdk.encodeAddress(txn.from);
    }
    const s = String(txn.from);
    if (s.length === 58) return s;
  }
  return null;
}

function isAddressFieldSet(addr) {
  if (addr === undefined || addr === null) return false;
  let bytes;
  if (addr.publicKey instanceof Uint8Array) bytes = addr.publicKey;
  else if (addr instanceof Uint8Array) bytes = addr;
  else if (typeof addr === "string")
    return (
      addr !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
    );
  else return Boolean(addr);
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) return true;
  }
  return false;
}

export function enforcePolicy(signer, decodedTxns) {
  const policy = signer.policy || {};
  const errors = [];

  if (policy.expiresAt && new Date() > new Date(policy.expiresAt)) {
    errors.push(`Signer "${signer.signerId}" expired at ${policy.expiresAt}`);
  }

  if (
    policy.maxTransactionsPerRequest != null &&
    decodedTxns.length > policy.maxTransactionsPerRequest
  ) {
    errors.push(
      `Too many transactions: ${decodedTxns.length} exceeds limit of ${policy.maxTransactionsPerRequest}`
    );
  }

  const signerAddr = signer.addresses.primary;
  const lsigAddr = signer.addresses.lsigAddress;

  for (let i = 0; i < decodedTxns.length; i++) {
    const txn = decodedTxns[i];

    const sender = getSenderAddress(txn);
    if (sender && sender !== signerAddr && sender !== lsigAddr) {
      errors.push(
        `Transaction[${i}]: sender ${sender} does not match signer address ${signerAddr}`
      );
    }

    if (!policy.allowRekey && isAddressFieldSet(txn.reKeyTo)) {
      errors.push(`Transaction[${i}]: rekey not allowed by policy`);
    }

    if (
      !policy.allowCloseRemainderTo &&
      isAddressFieldSet(txn.closeRemainderTo)
    ) {
      errors.push(
        `Transaction[${i}]: closeRemainderTo not allowed by policy`
      );
    }

    if (!policy.allowAssetCloseTo && isAddressFieldSet(txn.assetCloseTo)) {
      errors.push(`Transaction[${i}]: assetCloseTo not allowed by policy`);
    }
  }

  return errors;
}
