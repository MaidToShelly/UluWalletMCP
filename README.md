# UluWalletMCP

MCP server for managing Algorand signer records, enforcing local signing policy, and signing payloads.

> **Build anywhere, sign here.**

UluWalletMCP is **not responsible for** network access, querying chain state, building transactions, or broadcasting. The caller handles chain context and payload correctness. UluWalletMCP handles key management, policy enforcement, and signing only.

## Setup

```bash
npm install
```

Optionally set a custom data directory (defaults to `~/.ulu-wallet-mcp`):

```bash
export ULU_WALLET_MCP_DATA_DIR=/path/to/data
```

## Usage

```bash
node index.js
```

## Adding to a Client

```json
{
  "mcpServers": {
    "ulu-wallet-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/ulu-wallet-mcp/index.js"]
    }
  }
}
```

## Tools

### Signer Management

| Tool | Description |
|------|-------------|
| `wallet_list_signers` | List all registered signers |
| `wallet_get_signer` | Get full signer record by ID |
| `wallet_create_hot_signer` | Generate a new hot signer with fresh keypair |
| `wallet_import_hot_signer` | Import an account from a 25-word mnemonic |
| `wallet_create_lsig_signer` | Create a LogicSig signer from compiled TEAL |
| `wallet_delete_signer` | Delete a signer and its key material |

### Signing

| Tool | Description |
|------|-------------|
| `wallet_sign_transactions` | Sign unsigned transactions with policy enforcement |
| `wallet_sign_bytes` | Sign arbitrary bytes (hot signers only) |

## Core Concepts

### Signer Record

Each signer is a registered signing authority identified by `signerId`:

```json
{
  "signerId": "agent-hot-1",
  "signerType": "hot",
  "signerClass": "custody",
  "storageType": "local_file",
  "capabilities": ["sign_transactions", "sign_bytes"],
  "metadata": {
    "description": "Agent automation signer",
    "nickname": "agent-hot",
    "createdAt": "2026-03-07T18:00:00Z"
  },
  "addresses": {
    "primary": "ADDRESS_HERE",
    "authAddress": null,
    "lsigAddress": null
  },
  "policy": {
    "maxTransactionsPerRequest": 5,
    "allowRekey": false,
    "allowCloseRemainderTo": false,
    "allowAssetCloseTo": false,
    "expiresAt": null
  },
  "config": {},
  "state": {}
}
```

### Signer Types

| Type | Description | Use Cases |
|------|-------------|-----------|
| `hot` | Unattended local signer with key stored on disk | Automation, relays, fee sponsorship, agents |
| `lsig` | Stored LogicSig signer (Algorand-specific) | Constrained delegated signing, time-limited authority |
| `secure` | OS-keychain-backed signer (planned) | User custody, higher trust signing |

### Signer Classes

| Class | Meaning |
|-------|---------|
| `custody` | Signer controls key material directly |
| `delegated` | Constrained delegated authority (e.g. LogicSig) |
| `external` | Signing performed by external system (planned) |
| `virtual` | Identity-only record, no signing (planned) |

### Storage Types

| Type | Used By |
|------|---------|
| `local_file` | Hot signers — secret key stored in `~/.ulu-wallet-mcp/keys/` |
| `artifact` | LogicSig signers — serialized lsig stored in `~/.ulu-wallet-mcp/keys/` |
| `os_keychain` | Secure signers (planned) |

### Capabilities

| Capability | Description |
|------------|-------------|
| `sign_transactions` | Can sign Algorand transaction payloads |
| `sign_bytes` | Can sign arbitrary byte arrays (hot signers only) |

## Policy

Policy is enforced before every signing operation. Transactions violating policy are rejected.

| Field | Default | Description |
|-------|---------|-------------|
| `maxTransactionsPerRequest` | `5` | Max transactions per signing call |
| `allowRekey` | `false` | Allow transactions with `rekeyTo` set |
| `allowCloseRemainderTo` | `false` | Allow payment transactions that close the account |
| `allowAssetCloseTo` | `false` | Allow asset transfers that close out the asset |
| `expiresAt` | `null` | ISO 8601 expiry timestamp, `null` for no expiry |

Additionally, `wallet_sign_transactions` verifies that each transaction's sender address matches the signer's address before signing.

## Data Directory

All persistent state lives under `~/.ulu-wallet-mcp/` (or `$ULU_WALLET_MCP_DATA_DIR`):

```
~/.ulu-wallet-mcp/
├── signers.json          # Signer records (0600)
└── keys/                 # Key material directory (0700)
    ├── <signerId>.key    # Hot signer secret keys (0600, base64)
    └── <signerId>.lsig   # Serialized LogicSig artifacts (0600, base64)
```

Key material files are created with restrictive permissions (`0600`/`0700`).
