# wallet-mcp

MCP server for managing Algorand signer records, enforcing local signing policy, and signing payloads.

> **Build anywhere, sign here.**

The caller is responsible for chain context and payload correctness. WalletMCP handles key management and signing only.

## Setup

```bash
npm install
```

Optionally set a custom data directory (defaults to `~/.wallet-mcp`):

```bash
export WALLET_MCP_DATA_DIR=/path/to/data
```

## Usage

```bash
node index.js
```

## Adding to a Client

```json
{
  "mcpServers": {
    "wallet-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/wallet-mcp/index.js"]
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

## Signer Types

- **hot** — unattended local signer for automation, relays, and agents
- **lsig** — stored LogicSig signer (Algorand-specific, delegated authority)
- **secure** — OS-keychain-backed signer (planned)

## Policy

Each signer has a policy governing what it can sign:

```json
{
  "maxTransactionsPerRequest": 5,
  "allowRekey": false,
  "allowCloseRemainderTo": false,
  "allowAssetCloseTo": false,
  "expiresAt": null
}
```

Policy is enforced before every signing operation. Transactions violating policy are rejected.
