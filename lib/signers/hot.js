import algosdk from "algosdk";

export function generate() {
  const { addr, sk } = algosdk.generateAccount();
  return { address: addr, secretKey: sk };
}

export function fromMnemonic(mnemonic) {
  const { addr, sk } = algosdk.mnemonicToSecretKey(mnemonic);
  return { address: addr, secretKey: sk };
}

export function toMnemonic(secretKey) {
  return algosdk.secretKeyToMnemonic(secretKey);
}

export function signTransaction(sk, txnBytes) {
  const txn = algosdk.decodeUnsignedTransaction(txnBytes);
  return txn.signTxn(sk);
}

export function signBytes(sk, data) {
  return algosdk.signBytes(data, sk);
}
