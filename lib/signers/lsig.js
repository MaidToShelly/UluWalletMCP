import algosdk from "algosdk";

export function createLogicSigAccount(programBytes, delegatorSk) {
  const lsig = new algosdk.LogicSigAccount(programBytes);
  if (delegatorSk) {
    lsig.sign(delegatorSk);
  }
  return lsig;
}

export function signTransaction(lsigAccount, txnBytes) {
  const txn = algosdk.decodeUnsignedTransaction(txnBytes);
  const { blob } = algosdk.signLogicSigTransactionObject(txn, lsigAccount);
  return blob;
}

export function serialize(lsigAccount) {
  return lsigAccount.toByte();
}

export function deserialize(bytes) {
  return algosdk.LogicSigAccount.fromByte(bytes);
}

export function getAddress(lsigAccount) {
  return lsigAccount.address();
}
