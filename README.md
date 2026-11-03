# LAN discovery for DeepSeek Harness

An independent plugin that discovers local LLM API services through mDNS/DNS-SD and connects them to normal DeepSeek Harness conversations. Its compact service list works like a Wi-Fi picker: browse names, addresses, known capabilities and credential status, then select a service to reveal connection controls. English and Chinese follow the Harness language automatically.

This repository contains the client plugin only. It does not start model servers or announce services. The reusable discovery core is a versioned dependency; service advertisement and the Docker demonstration are maintained separately. You can build and install this checkout without cloning those repositories.

## Compatibility

- Node.js 24 or later for building and testing.
- DeepSeek Harness Desktop **0.2.1-rc.3** has completed Desktop acceptance. **0.2.1-rc.5** is also allowed after checking its installed Host and browser integration interfaces; its Desktop acceptance is recorded separately in the Demo validation report. Other releases require checking the integration interfaces.
- Services announce `_llm-api._tcp.local` and implement the supported **Open Responses subset plus this project's experimental capability metadata endpoint**. Announcement alone does not make an arbitrary existing LLM server compatible; adapt the server or place a compatible API adapter in front of it.
- Discovery requires mDNS multicast reachability on the selected local network. Inference uses direct HTTPS from the Harness Host to the chosen API.

The discovery fields follow the experimental [IETF draft](https://datatracker.ietf.org/doc/draft-cui-dawn-local-llm-api-discovery/). The application metadata and local trust documents are project extensions, not standardized draft fields. Read the [service contract](docs/service-contract.md) before integrating a server.

## Build and install

From this checkout:

```sh
npm ci
npm run build
npm test
npm pack
```

The core dependency is supplied as a versioned archive in `vendor/`, with dependency integrity recorded in `package-lock.json`. `npm ci` does not require a sibling checkout or an unpublished npm package. The plugin's npm tarball bundles that core and its runtime dependencies.

Fully quit Harness before installing or updating the plugin. Use the **Desktop installation's bundled CLI**, not an unrelated global `dsh`. On Windows, replace the sample installation path below:

```powershell
$dsh = 'C:/path/to/DeepseekHarness/resources/runtime/cli/bin/dsh.cmd'
& $dsh plugin --profile desktop add (Resolve-Path './dsh-lan-discovery-0.5.0.tgz').Path
```

For development, link this checkout instead of the tarball:

```powershell
& $dsh plugin --profile desktop add (Get-Location).Path
```

A linked installation needs this checkout and its `node_modules` to remain available. After editing linked Host or browser code, fully quit and reopen Harness to load both halves. The Host supplies the declared `@deepseek-ai/dsh-llm` and optional `@deepseek-ai/dsh-tools` peer packages.

## Configure and connect

Provision a local trust document independently from discovery; the server operator supplies its endpoint, authorized IPs, CA, certificate fingerprint, and authentication policy. If the service requires an API key, obtain one separately and enter it in the plugin. In the Desktop profile's existing `lan-discovery` entry, set:

```yaml
- id: lan-discovery
  name: dsh-lan-discovery
  config:
    trustFile: 'C:/llm-discovery/trust.json'
    interfaceAddress: '192.168.1.10'
    networkId: 'office-lan'
    autoStart: true
    demoMode: false
```

Use the client's actual interface address. Keep the existing entry's other fields and other profile entries. `DSH_LAN_DISCOVERY_TRUST_FILE` is an alternative to `trustFile`. `stateFile` optionally changes the recovery-journal location; by default it is `plugin-state.json` beside the trust document.

A normal trust document looks like:

```json
{
  "schema": "llm-api-discovery-trust/v1",
  "caFile": "ca.pem",
  "services": [{
    "baseURL": "https://node.local:8443/v1",
    "allowedAddresses": ["192.168.1.20"],
    "certificateSha256": "REPLACE_WITH_64_HEX_CHARACTERS_OF_LEAF_DER_SHA256",
    "auth": "required"
  }]
}
```

Paths resolve relative to this document. The sample fingerprint is a placeholder and must be replaced. Credentials and trust paths do not come from multicast announcements. A manually entered API key travels from the password field to the authenticated Harness Host; the Host never returns it in service state, and local trust-file paths do not enter the UI. The legacy `llm-discovery-demo-trust/v1` schema remains accepted.

Open **LAN services**. Initially the list shows service information only; password fields, key management, inspection and connection controls appear after selecting a row. One service expands at a time. Selecting a service does not connect it or change the default model; choose **Connect and start a conversation** or **Verify and connect** explicitly. Collapsing a row or selecting another clears any unsent password. The list distinguishes three common cases:

| Status | What to do |
|---|---|
| **No API key required** | Expand the row, then inspect or connect without entering a key. |
| **API key saved · Ready to connect** | Expand the row to connect, or change/clear the saved key. |
| **API key required** | Expand the row, enter the service's key and select **Verify and connect**. |

A saved-key label describes local credential availability; it does not prove that a key is still valid or that the service is currently reachable. Each connection still verifies the endpoint and service metadata. Discovery alone does not establish trust or compatibility. Unknown model details and capabilities remain unknown until an explicit inspection or connection succeeds.

Normal services do not receive a generic **Discovered**, **Mock**, or **Real** badge. **Connected / 已接入** indicates a service with a registered plugin route. If a service's capability response explicitly declares `mock: true`, its expanded details include a simulation notice. An absent or false `mock` value is not evidence of genuine model inference, and does not create a "real service" badge. This UI is shared by ordinary deployments and the separate Demo.

**Remember this API key** is selected by default when the Harness credential provider is available. A successfully verified key is saved through the official Host `credentials` API and remains available after restarting Harness. Clear that checkbox to use the key in memory for this run only. The password field clears immediately on submission; a saved key is represented by its status, never copied back into the field. The Host verifies the model list and `{base}/_llm/capabilities` before retaining the key. A rejected replacement leaves the prior valid key intact. The plugin does not create API keys, enroll accounts, or run an OAuth flow.

Saved keys use the active Harness credential provider under `lan-discovery/service-<identity>`. Storage protection is provided by Harness: the reviewed local provider persists records in profile YAML and does not provide OS-backed encryption. The plugin does not read or rewrite the credential file directly. It never includes keys in UI state, logs, browser storage, plugin configuration, or its recovery journal. If the provider is unavailable, the UI offers session-only use.

**Disconnect and restore default** keeps keys available for reconnecting. **Clear API key** removes the saved/session key owned by this plugin and disconnects that service. Exiting Harness or reloading/unloading the plugin clears session-only keys; saved keys remain until cleared. Changing a saved key with **Remember** unchecked removes its saved copy after successful validation. An optional `tokenFile` in a required-auth trust entry supplies a pre-provisioned key instead; the UI cannot delete that file, and clearing a plugin-managed override restores the file fallback.

Omitting `auth` in a trust entry means `required` for compatibility. An experimental key-free service needs `auth: "none"` in both its advertisement and independent local trust entry, with no `tokenFile`; the client sends no API key to it. This is an experiment extension: [draft-00 §5.3](https://datatracker.ietf.org/doc/draft-cui-dawn-local-llm-api-discovery/00/) requires `auth=required` for its Open Responses binding, so the key-free scenario does not conform to that binding.

Existing conversations retain their previous model. **Disconnect and restore default** removes the plugin's temporary providers and restores the previous default if the user has not subsequently changed it. Disconnect before disabling or uninstalling the plugin.

Every connection checks the exact authorized URL, discovered and allowed IP intersection, certificate chain, hostname, leaf fingerprint, and agreement between advertised and locally authorized authentication policy. Both saved and session keys are bound to the endpoint, certificate, approved IP set, and authentication policy, not just a friendly service name. A changed identity requires a new key verification. Redirects are rejected. This trust is scoped to the plugin; it does not modify system certificates, global DNS, global TLS behavior, or unrelated provider credentials.

## Language

The page and sidebar subscribe to Harness's official `locale` service. A Harness language preference takes priority; without one, Harness selects from the native system's ordered languages, or browser languages on the web, with English as fallback. Switching Harness between English and Chinese updates the plugin immediately without reconnecting or clearing discovered services. The plugin does not write language preferences.

Translations live in `locale/en.json` and `locale/zh.json`. The build checks matching keys and interpolation parameters, then bundles them with `src/client.js` into `client.js`. Common errors are translated; unknown transport or protocol diagnostics retain their details under a localized error prefix. Model names, machine names, addresses, and protocol field names stay unchanged.

## Supported behavior and limits

The adapter supports text, normalized local image attachments up to 5 MiB, streamed response text, function calls and corresponding client tool results, cancellation, and terminal events. Capability metadata determines which options the UI offers. Nonstream-only services remain discoverable but cannot be selected by this streaming adapter.

This is an experimental adapter, not full Open Responses conformance. JSON Schema output, server-side search, remote image URL fetching, opaque reasoning replay, and inference failover are not implemented. Models are executed by the connected service; this plugin downloads no model weights.

`demoMode` is **false by default**. Enable it only for the separate deterministic demonstration. It switches capability discovery to `{base}/_demo/capabilities`, enables the local `demo_read_marker` tool, and adds explicit Host-context sidecar metadata for Mock responses. Normal connections do none of these. See [integration notes](docs/integration-notes.md) for the mode boundary, provider recovery, and Host interfaces.

## Development and distribution

Edit `src/client.js` and the locale files, then run `npm run build`; do not edit generated `client.js` directly. `npm test` exercises the independent plugin's Host boundaries, locale updates, and recovery behavior without requiring a desktop session or multicast network.

The CI workflow builds, tests, and packs on Windows and Linux using Node.js 24. It retains the package as a workflow artifact and does not publish to npm. Native Desktop integration and real-network interoperability remain separate acceptance checks.

Licensed under [MIT](LICENSE).
