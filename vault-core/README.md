# @orangecheck/vault-core

The crypto, entry model, and `ocv://` secret-reference resolver for
**OC Vault** (`vault.ochk.io`) — the foundation of the OC Vault developer
platform (CLI, SDK, GitHub Action).

Zero-knowledge by construction: the vault key is derived in-process from the
passphrase and never transmitted. The API client moves ciphertext only.

```ts
import { OcVault, VaultClient } from '@orangecheck/vault-core';

const vault = await OcVault.open({
  client: new VaultClient({ token: process.env.OCV_TOKEN }),
  passphrase: process.env.OCV_PASSPHRASE!,
});

vault.resolve('ocv://personal/Stripe/key');          // → the API key
vault.resolve('ocv://personal/GitHub/login?attr=otp'); // → a live TOTP code
vault.list();                                         // → metadata, no secrets
```

Offline, from a portable export — no network:

```ts
const vault = OcVault.fromExport(exportJson, escrowWrappedKey, passphrase);
```

## What's here

- **crypto** — `unwrapVaultKey`, `decryptFields` / `encryptFields`,
  `packEntryForCloud` / `unpackEntryFromCloud`. Conformance-pinned to the
  oc-vault blob format **v1**.
- **model** — `VaultEntry`, the per-type field shapes, `toSummary`.
- **refs** — `parseSecretRef`, `resolveSecretRef`, the `ocv://` scheme.
- **sync** — `VaultClient`, a transport-agnostic vault.ochk.io API client.
- **`OcVault`** — the facade that ties them together.

See `VAULT-DEVELOPER-PLATFORM.md` for the design and roadmap.

## License

MIT © OrangeCheck
