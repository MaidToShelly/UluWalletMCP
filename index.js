import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import algosdk from "algosdk";
import { SignerStore } from "./lib/store.js";
import * as hot from "./lib/signers/hot.js";
import * as lsig from "./lib/signers/lsig.js";
import { enforcePolicy } from "./lib/policy.js";

const store = new SignerStore();
await store.init();

const server = new McpServer({
  name: "wallet-mcp",
  version: "0.1.0",
});

const DEFAULT_POLICY = {
  maxTransactionsPerRequest: 5,
  allowRekey: false,
  allowCloseRemainderTo: false,
  allowAssetCloseTo: false,
  expiresAt: null,
};

const PolicySchema = z
  .object({
    maxTransactionsPerRequest: z.number().int().positive().optional(),
    allowRekey: z.boolean().optional(),
    allowCloseRemainderTo: z.boolean().optional(),
    allowAssetCloseTo: z.boolean().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .optional();

function ok(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function err(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ── Signer Management ──────────────────────────────────────────────

server.tool(
  "wallet_list_signers",
  "List all registered signers with summary info",
  {},
  async () => {
    const signers = await store.list();
    const summaries = signers.map((s) => ({
      signerId: s.signerId,
      signerType: s.signerType,
      signerClass: s.signerClass,
      address: s.addresses?.primary,
      nickname: s.metadata?.nickname,
      capabilities: s.capabilities,
    }));
    return ok(summaries);
  }
);

server.tool(
  "wallet_get_signer",
  "Get full signer record by signerId",
  { signerId: z.string().describe("Signer identifier") },
  async ({ signerId }) => {
    const signer = await store.get(signerId);
    if (!signer) return err(`Signer "${signerId}" not found`);
    return ok(signer);
  }
);

server.tool(
  "wallet_create_hot_signer",
  "Generate a new hot signer with a fresh keypair for automation, relays, or agent operations",
  {
    signerId: z.string().describe("Unique identifier for the signer"),
    description: z.string().optional().describe("Human-readable description"),
    nickname: z.string().optional().describe("Short nickname"),
    policy: PolicySchema,
  },
  async ({ signerId, description, nickname, policy }) => {
    if (await store.get(signerId)) {
      return err(`Signer "${signerId}" already exists`);
    }

    const { address, secretKey } = hot.generate();
    await store.saveKey(signerId, secretKey);

    const record = {
      signerId,
      signerType: "hot",
      signerClass: "custody",
      storageType: "local_file",
      capabilities: ["sign_transactions", "sign_bytes"],
      metadata: {
        description: description || "Hot signer",
        nickname: nickname || signerId,
        createdAt: new Date().toISOString(),
      },
      addresses: {
        primary: address,
        authAddress: null,
        lsigAddress: null,
      },
      policy: { ...DEFAULT_POLICY, ...policy },
      config: {},
      state: {},
    };

    await store.put(record);
    return ok(record);
  }
);

server.tool(
  "wallet_import_hot_signer",
  "Import an existing account as a hot signer from a 25-word Algorand mnemonic",
  {
    signerId: z.string().describe("Unique identifier for the signer"),
    mnemonic: z.string().describe("25-word Algorand mnemonic phrase"),
    description: z.string().optional().describe("Human-readable description"),
    nickname: z.string().optional().describe("Short nickname"),
    policy: PolicySchema,
  },
  async ({ signerId, mnemonic, description, nickname, policy }) => {
    if (await store.get(signerId)) {
      return err(`Signer "${signerId}" already exists`);
    }

    let account;
    try {
      account = hot.fromMnemonic(mnemonic);
    } catch (e) {
      return err(`Invalid mnemonic: ${e.message}`);
    }

    await store.saveKey(signerId, account.secretKey);

    const record = {
      signerId,
      signerType: "hot",
      signerClass: "custody",
      storageType: "local_file",
      capabilities: ["sign_transactions", "sign_bytes"],
      metadata: {
        description: description || "Imported hot signer",
        nickname: nickname || signerId,
        createdAt: new Date().toISOString(),
      },
      addresses: {
        primary: account.address,
        authAddress: null,
        lsigAddress: null,
      },
      policy: { ...DEFAULT_POLICY, ...policy },
      config: {},
      state: {},
    };

    await store.put(record);
    return ok(record);
  }
);

server.tool(
  "wallet_create_lsig_signer",
  "Create a LogicSig signer from a compiled TEAL program. Optionally delegate from an existing hot signer.",
  {
    signerId: z.string().describe("Unique identifier for the signer"),
    program: z
      .string()
      .describe("Base64-encoded compiled TEAL program bytecode"),
    delegatorSignerId: z
      .string()
      .optional()
      .describe(
        "signerId of an existing hot signer to delegate authority from"
      ),
    description: z.string().optional().describe("Human-readable description"),
    nickname: z.string().optional().describe("Short nickname"),
    policy: PolicySchema,
  },
  async ({
    signerId,
    program,
    delegatorSignerId,
    description,
    nickname,
    policy,
  }) => {
    if (await store.get(signerId)) {
      return err(`Signer "${signerId}" already exists`);
    }

    let programBytes;
    try {
      programBytes = new Uint8Array(Buffer.from(program, "base64"));
    } catch (e) {
      return err(`Invalid program encoding: ${e.message}`);
    }

    let delegatorSk = null;
    let delegatorAddress = null;

    if (delegatorSignerId) {
      const delegator = await store.get(delegatorSignerId);
      if (!delegator || delegator.signerType !== "hot") {
        return err(
          `Delegator "${delegatorSignerId}" not found or not a hot signer`
        );
      }
      delegatorSk = await store.loadKey(delegatorSignerId);
      delegatorAddress = delegator.addresses.primary;
    }

    const lsigAccount = lsig.createLogicSigAccount(programBytes, delegatorSk);
    const lsigBytes = lsig.serialize(lsigAccount);
    await store.saveLsig(signerId, lsigBytes);

    const lsigAddress = lsig.getAddress(lsigAccount);
    const primaryAddress = delegatorAddress || lsigAddress;

    const record = {
      signerId,
      signerType: "lsig",
      signerClass: "delegated",
      storageType: "artifact",
      capabilities: ["sign_transactions"],
      metadata: {
        description: description || "LogicSig signer",
        nickname: nickname || signerId,
        createdAt: new Date().toISOString(),
        delegatorSignerId: delegatorSignerId || null,
      },
      addresses: {
        primary: primaryAddress,
        authAddress: delegatorAddress,
        lsigAddress,
      },
      policy: { ...DEFAULT_POLICY, ...policy },
      config: {},
      state: {},
    };

    await store.put(record);
    return ok(record);
  }
);

server.tool(
  "wallet_delete_signer",
  "Delete a signer and its key material",
  { signerId: z.string().describe("Signer identifier to delete") },
  async ({ signerId }) => {
    const signer = await store.get(signerId);
    if (!signer) return err(`Signer "${signerId}" not found`);

    await store.deleteKeyMaterial(signerId);
    await store.delete(signerId);
    return ok({ deleted: signerId });
  }
);

// ── Signing ────────────────────────────────────────────────────────

server.tool(
  "wallet_sign_transactions",
  "Sign an array of unsigned transactions. Enforces signer policy before signing. Accepts base64-encoded unsigned transaction bytes and returns base64-encoded signed transaction bytes.",
  {
    signerId: z.string().describe("Signer to use for signing"),
    transactions: z
      .array(z.string())
      .min(1)
      .describe("Array of base64-encoded unsigned transaction bytes"),
  },
  async ({ signerId, transactions }) => {
    const signer = await store.get(signerId);
    if (!signer) return err(`Signer "${signerId}" not found`);

    if (!signer.capabilities.includes("sign_transactions")) {
      return err(
        `Signer "${signerId}" does not have sign_transactions capability`
      );
    }

    const decodedTxns = [];
    const rawBytes = [];

    for (let i = 0; i < transactions.length; i++) {
      try {
        const bytes = new Uint8Array(Buffer.from(transactions[i], "base64"));
        rawBytes.push(bytes);
        decodedTxns.push(algosdk.decodeUnsignedTransaction(bytes));
      } catch (e) {
        return err(`Failed to decode transaction[${i}]: ${e.message}`);
      }
    }

    const policyErrors = enforcePolicy(signer, decodedTxns);
    if (policyErrors.length > 0) {
      return err(`Policy violation:\n${policyErrors.join("\n")}`);
    }

    try {
      const signedTxns = [];

      if (signer.signerType === "hot") {
        const sk = await store.loadKey(signerId);
        for (const bytes of rawBytes) {
          const txn = algosdk.decodeUnsignedTransaction(bytes);
          signedTxns.push(Buffer.from(txn.signTxn(sk)).toString("base64"));
        }
      } else if (signer.signerType === "lsig") {
        const lsigBytes = await store.loadLsig(signerId);
        const lsigAccount = lsig.deserialize(lsigBytes);
        for (const bytes of rawBytes) {
          const signed = lsig.signTransaction(lsigAccount, bytes);
          signedTxns.push(Buffer.from(signed).toString("base64"));
        }
      } else {
        return err(
          `Signing not implemented for signer type: ${signer.signerType}`
        );
      }

      return ok({ signedTransactions: signedTxns });
    } catch (e) {
      return err(`Signing failed: ${e.message}`);
    }
  }
);

server.tool(
  "wallet_sign_bytes",
  "Sign arbitrary bytes with a hot signer. Returns an Ed25519 signature. The data is prefixed with 'MX' before signing per Algorand convention.",
  {
    signerId: z.string().describe("Hot signer to use for signing"),
    data: z.string().describe("Base64-encoded bytes to sign"),
  },
  async ({ signerId, data }) => {
    const signer = await store.get(signerId);
    if (!signer) return err(`Signer "${signerId}" not found`);

    if (!signer.capabilities.includes("sign_bytes")) {
      return err(
        `Signer "${signerId}" does not have sign_bytes capability`
      );
    }

    if (signer.signerType !== "hot") {
      return err("sign_bytes is only supported for hot signers");
    }

    if (signer.policy?.expiresAt && new Date() > new Date(signer.policy.expiresAt)) {
      return err(`Signer "${signerId}" has expired`);
    }

    try {
      const sk = await store.loadKey(signerId);
      const bytes = new Uint8Array(Buffer.from(data, "base64"));
      const signature = hot.signBytes(sk, bytes);
      return ok({
        signature: Buffer.from(signature).toString("base64"),
        publicKey: signer.addresses.primary,
      });
    } catch (e) {
      return err(`Signing failed: ${e.message}`);
    }
  }
);

// ── Start ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
