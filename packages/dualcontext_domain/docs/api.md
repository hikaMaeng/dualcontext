# API

Public exports:

| Export | Purpose |
| --- | --- |
| `dualcontext_domain` | Common domain entrypoint. |
| `dualcontext_domain/common` | Runtime-neutral domain entrypoint. |
| `dualcontext_domain/server` | Server-only domain entrypoint. |
| `dualcontext_domain/front` | Front-only domain entrypoint. |

Add APIs only when a requested product behavior needs a durable domain contract.
