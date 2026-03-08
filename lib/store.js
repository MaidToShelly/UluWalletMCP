import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_DATA_DIR = join(homedir(), ".ulu-wallet-mcp");

export class SignerStore {
  constructor(dataDir) {
    this.dataDir = dataDir || process.env.ULU_WALLET_MCP_DATA_DIR || DEFAULT_DATA_DIR;
    this.recordsPath = join(this.dataDir, "signers.json");
    this.keysDir = join(this.dataDir, "keys");
  }

  async init() {
    await mkdir(this.keysDir, { recursive: true, mode: 0o700 });
    if (!existsSync(this.recordsPath)) {
      await writeFile(this.recordsPath, "{}", { mode: 0o600 });
    }
  }

  async _load() {
    return JSON.parse(await readFile(this.recordsPath, "utf-8"));
  }

  async _save(records) {
    await writeFile(this.recordsPath, JSON.stringify(records, null, 2), {
      mode: 0o600,
    });
  }

  async list() {
    return Object.values(await this._load());
  }

  async get(signerId) {
    return (await this._load())[signerId] || null;
  }

  async put(record) {
    const records = await this._load();
    records[record.signerId] = record;
    await this._save(records);
  }

  async delete(signerId) {
    const records = await this._load();
    if (!records[signerId]) return false;
    delete records[signerId];
    await this._save(records);
    return true;
  }

  keyPath(signerId) {
    return join(this.keysDir, `${signerId}.key`);
  }

  lsigPath(signerId) {
    return join(this.keysDir, `${signerId}.lsig`);
  }

  async saveKey(signerId, secretKey) {
    await writeFile(
      this.keyPath(signerId),
      Buffer.from(secretKey).toString("base64"),
      { mode: 0o600 }
    );
  }

  async loadKey(signerId) {
    const data = await readFile(this.keyPath(signerId), "utf-8");
    return new Uint8Array(Buffer.from(data.trim(), "base64"));
  }

  async saveLsig(signerId, lsigBytes) {
    await writeFile(
      this.lsigPath(signerId),
      Buffer.from(lsigBytes).toString("base64"),
      { mode: 0o600 }
    );
  }

  async loadLsig(signerId) {
    const data = await readFile(this.lsigPath(signerId), "utf-8");
    return new Uint8Array(Buffer.from(data.trim(), "base64"));
  }

  async deleteKeyMaterial(signerId) {
    for (const p of [this.keyPath(signerId), this.lsigPath(signerId)]) {
      try {
        await rm(p);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  }
}
