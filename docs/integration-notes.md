# Harness integration notes

This document records Desktop behavior verified against DeepSeek Harness 0.2.1-rc.3 and an installed-interface review of 0.2.1-rc.5. Revalidate these interfaces when upgrading Harness. See the [README](../README.md) for installation and the [service contract](service-contract.md) for the server-facing API.

## 0.2.1-rc.5 compatibility review

On 2026-11-03, the installed rc.5 Host and browser bundles were checked against this plugin's actual calls. The following contracts remain available with compatible arguments and results: `connection.fetch.register` exact routes and their owner-principal gate; `llm.registerAdapter` and its callable disposer; `attributionHeaders`; `settings.describe` and revision-checked `settings.mutate`; `loader.await`; `attachments.readImageRequest`; `defineTool` and `tools.register`; `locale.register/bind/subscribe/getSnapshot`; the `main` and `sidebar.panellist` slots; `layout.panelInfo/selectPanel`; and `uiWorkspace.startSession` with `clearPreviousDraft: false`. The Desktop shell still forwards same-origin `dsh-app` Fetch requests using its Host-issued cookie without exposing that cookie to the renderer.

Plugin 0.4.0 explicitly permits rc.3 and rc.5 in its Host engine and optional peer ranges. It does not use a compatibility exemption or allow unreviewed prereleases. The interface review is not a substitute for a live Desktop acceptance run; the separate Demo validation report records which native interactions have actually been repeated on rc.5. No application bundle, extracted source, user profile, or authentication material is redistributed with this review.

## Host package resolution

The two `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-tools` peers come from the installed Host, so their absence from the checkout's `node_modules` is expected. In Desktop 0.2.1-rc.3, `dsh-app-boot` recognizes profile-linked package roots and routes their declared `peerDependencies` to the installation's packages (`ResolutionRouter.routeLinked`). Keep those peer declarations when packaging; running `apply()` in plain Node without Harness's profile loader does not reproduce that resolution. This behavior was checked against the installed runtime source and must be revalidated when upgrading Harness.

## Provider lifecycle and default recovery

Clicking Connect checks the model and capability endpoints using the independently authorized authentication policy, creates one provider per immutable endpoint/certificate/address/auth identity, and conditionally changes the default model through the installed revisioned settings API. Existing conversation routes are unchanged. Disconnect restores the original non-LAN default only when the user has not changed it, then removes this plugin's runtime routes. Plugin unload closes sockets and transports, clears session keys, and retains its recovery journal; it does not write settings while the Loader is disposing the plugin.

After activation returns and the Loader settles, the plugin attempts conditional recovery of a leftover LAN default. Recovery never blocks activation, since settings writes themselves wait for Loader reconciliation. During development HMR, the Host may reject a nested configuration transaction; that recovery remains visibly pending, new connections stay disabled, and **Disconnect and restore default** remains available even with no registered routes. Its authenticated request retries the same compare-and-set recovery outside the HMR transaction. Later user changes are preserved. Do not edit linked plugin files during an acceptance run: HMR replaces the controller and its runtime-only adapters.

Before disabling or uninstalling the plugin, click **Disconnect and restore default** and confirm recovery has completed. An uninstalled plugin cannot consume its retained recovery journal on the next launch.

The UI describes a service as discovered before it is trusted or usable. Capability checks are explicit; unknown capability information does not become a fabricated claim. Nonstream-only services remain visible but cannot be selected by this streaming adapter.

## API key lifecycle

An advertisement's `auth` value is a hint. `authorizeCandidate` requires it to match the independent trust entry; absent `auth` in that local entry means `required`. The `none` experiment additionally prohibits `tokenFile` and sends no Authorization header. It is outside draft-00's Open Responses binding, whose §5.3 requires `auth=required`; see the [service contract](service-contract.md).

The browser accepts a key in a password field and sends it with a `remember` boolean to the authenticated owner-only `credential` route. The controlled input clears immediately, including on failure. The Host validates the exact authorized service's models and capability document before saving the key through Harness or adding it to a private session map. A failed verification leaves the prior valid key intact. Both saved and session keys are indexed by endpoint, leaf fingerprint, approved IP set, and auth policy rather than by instance name alone.

`credentials.mjs` adapts the official Host `ctx.credentials` record API (`listRecords`, `readRecord`, `modifyRecord`, `deleteRecord`). It uses only records named `lan-discovery/service-<64-hex-identity>` with `kind: "grant"` and the payload `{ schema: "dsh-lan-discovery-credential/v1", identity, candidateId, apiKey }`. It reads only its own records, validates their schema, caches credential metadata for UI status, and reads a saved key from the provider when making a service request. The provider manages persistence; the plugin never edits its backing file directly. The reviewed local provider stores records in profile YAML without OS-backed encryption. This integration does not claim otherwise.

State exposes `credentialStorage.available` and `candidate.credential = { required, configured, source }`, where source is `saved`, `session`, `file`, or null. An obsolete plugin-owned credential can additionally set `retainedSaved` or `retainedSession`, so it remains clearable without authorizing the changed discovery record. State never exposes keys or credential-file paths. `API_KEY_REQUIRED`, `API_KEY_REJECTED`, `API_KEY_INVALID`, `CREDENTIAL_STORE_UNAVAILABLE`, and `CREDENTIAL_STORE_FAILED` use fixed messages and codes; the browser translates these and retains a submission error across successful polling. Keys are absent from diagnostic logs, browser storage, plugin configuration, and the recovery journal.

The UI defaults **Remember this API key** to selected when the provider is available. Saved credentials survive Harness restart or plugin reload. Unchecking it requests session-only use; successfully replacing a saved key this way removes the saved copy. An unavailable provider leaves session-only use available and does not silently save elsewhere. The control API defaults an omitted `remember` to `false` for backward compatibility.

Disconnecting removes routes while keeping saved and session keys for reconnecting. `forget-credential` removes this plugin's matching saved/session keys and disconnects the affected service; an existing operator-managed `tokenFile` remains available as fallback. Exiting Harness or reloading/unloading this plugin clears only the memory map. There is no API key creation or OAuth enrollment.

## Explicit demo mode

Normal use leaves `demoMode` absent or `false`. It reads `{base}/_llm/capabilities`, does not register `demo_read_marker`, and does not add `demo_context_indices` to requests. Both the current `llm-api-discovery-capabilities/v1` schema and the legacy `llm-discovery-demo-capabilities/v1` schema are accepted for compatibility.

The separate demonstration repository enables `demoMode: true`. Only that mode uses `{base}/_demo/capabilities`, registers the no-argument, read-only `demo_read_marker` tool, and adds the context metadata described below. Its local trust document supplies `markerFile`; the server must not receive or mount that file. Normal tool execution still follows Harness's permission pipeline.

Harness context retains its original `user` role and text. In demo mode, for text-only messages, the adapter marks only these verified `source.kind` / `source.form` pairs from Harness 0.2.1-rc.3: `time-context` / `snapshot`, `skill-catalog` / `catalog`, `agent-instructions` / `instructions`, and `runtime-context` / `snapshot`. The agent loop's explicitly verified runtime-clear branch, `runtime-context` without a form, is also marked. Their final input indices go into the standard Responses string metadata field `demo_context_indices` (a JSON array, at most 64 entries and 512 characters). This demo-specific convention lets the deterministic Mock distinguish the real user prompt and tool turn boundary from Host context; it does not change instructions, remove input, or form part of the DNS discovery protocol. Unknown producers, ordinary user messages, goal/schedule/question messages, mismatched source forms, and multimodal messages are never marked. Message text is never used to guess provenance. The Mock also accepts the previous clock-only `demo_time_context_indices` field, but rejects requests containing both names.

## Diagnostics and authenticated UI routes

Each adapter request emits a `lan-discovery request` Host log entry containing only the last 128 message roles and `source.kind` / `source.form` identifiers, plus actual wire tool names. The same latest diagnostic is available as `lastRequestDiagnostics` on the existing authenticated state route. It contains no prompt text, context sections, file paths, attachment data, tool arguments/results, session identifiers, or credentials; it is not written into the recovery journal. This lets an installed version's actual producer and tool surface be checked without opening conversation contents.

This is an experimental interoperability adapter, not a claim of full Open Responses conformance. JSON Schema output, server-side search, remote image URL fetching, opaque reasoning replay and inference failover are not implemented.

The live control API uses Harness's `connection.fetch.register` exact-route registry under `/api/lan-discovery/`. The installed framework admits an authenticated Peer and requires the owner principal before dispatching these routes, for both Desktop and Web HTTP. Registration fails closed if that registry is unavailable. Eight routes are registered:

| Method | Relative route | Request |
|---|---|---|
| GET | `state` | No body; includes credential status only |
| POST | `start` | `{}` |
| POST | `stop` | `{}` |
| POST | `inspect` | `{ candidateId }` |
| POST | `connect` | `{ candidateId, modelId? }` |
| POST | `disconnect` | `{}` |
| POST | `credential` | `{ candidateId, apiKey, remember? }`; verify before retaining, omitted `remember` means session-only |
| POST | `forget-credential` | `{ candidateId }`; forget plugin-managed saved/session keys and disconnect that service |

The browser uses standard same-origin fetch. Desktop 0.2.1-rc.3's shell `forwardWebRequest` forwards `dsh-app://app` requests to its authenticated Host and keeps the authentication cookie out of the renderer; no private global transport hook is required. The bundle registers `sidebar.panellist` and `main`, uses `uiWorkspace.startSession` after connection, and refreshes state every two seconds. After modifying Host or browser code in the linked development package, fully quit and reopen Desktop to reload both halves; a renderer refresh alone may retain the Host's previous browser-bundle snapshot.

No installed application code, user profile, local trust document, or credentials are packaged with this plugin.
