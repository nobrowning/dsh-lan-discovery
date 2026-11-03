# Service integration contract

The plugin discovers `_llm-api._tcp.local` records using the discovery core. It currently connects only the `openresponses` profile with binding version `2026-04-24`. Announcement makes an endpoint visible; it does not establish trust or add an API implementation to a server.

## HTTP interface

Implement these HTTPS routes under the announced `base` path. All three use the same authentication policy:

- `GET /models`: `{ "object": "list", "data": [{ "id": "my-model", "name": "My model" }] }`.
- `GET /_llm/capabilities`: the experimental metadata below. This route and schema are this project's extension, not standardized by the discovery draft.
- `POST /responses`: streaming text Responses events, with image input and function calls only when declared. See the adapter source for the supported event subset. Nonstream-only services can be inspected but cannot be connected by this adapter.

```json
{
  "schema": "llm-api-discovery-capabilities/v1",
  "revision": "1",
  "cache_max_age_seconds": 60,
  "mock": false,
  "node_label": "workstation.local",
  "models": [{
    "id": "my-model",
    "display_name": "My model",
    "input_modalities": ["text"],
    "output_modalities": ["text"],
    "streaming": "supported",
    "function_calling": "unsupported"
  }]
}
```

`models[].id` must also appear in `/models`. Optional `deployment` contains string fields `parameters`, `quantization` (or precision, e.g. BF16), and `version`. Capability claims describe the deployed API, not every feature of its underlying model family. The plugin sends the original model ID and never a translated display name.

For a service without this capability route, add a small service-side metadata adapter before using this client. The announcer alone is enough for DNS-SD discovery, but not for complete client interoperability. OpenAI Chat Completions, Ollama-native APIs, automatic credential enrollment and the entire Open Responses specification are not implemented by this release.

## Authentication policy

For `auth=required`, accept the service's API key in the `Authorization: Bearer …` header on the model, capability, and response endpoints. A missing or rejected key should result in HTTP 401 or 403. The plugin prompts for a key without generating one or initiating OAuth. A key supplied through the UI is retained only after both metadata requests succeed.

The optional experimental `auth=none` scenario is supported only when independent local trust explicitly authorizes `none` as well. No Authorization header or file credential is sent in this mode, and a trust entry combining `auth: "none"` with `tokenFile` is rejected. A mismatch between discovered and locally configured policy is also rejected; a network announcement cannot downgrade a required-auth trust entry.

This key-free scenario is outside the initial Open Responses binding in [draft-cui-dawn-local-llm-api-discovery-00 §5.3](https://datatracker.ietf.org/doc/draft-cui-dawn-local-llm-api-discovery/00/), which requires advertisers using that binding to set `auth=required`. Present it as a project experiment, not conformance to draft-00.

## Independent trust

Provision this file through a trusted local channel and set the plugin's `trustFile` to its path:

```json
{
  "schema": "llm-api-discovery-trust/v1",
  "caFile": "ca.pem",
  "services": [{
    "baseURL": "https://workstation.local:8443/v1",
    "allowedAddresses": ["192.168.1.50"],
    "certificateSha256": "REPLACE_WITH_SHA256_OF_LEAF_CERTIFICATE_DER",
    "auth": "required"
  }]
}
```

Paths resolve relative to the trust file. `auth` defaults to `required` when absent. A required-auth entry may optionally include `"tokenFile": "tokens/workstation.txt"` for the pre-provisioned file-based workflow; otherwise the user enters a key in the plugin. For a key-free experiment, explicitly set `"auth": "none"` and omit `tokenFile`.

The API must use a certificate matching its advertised hostname. The plugin verifies the CA chain, hostname, leaf fingerprint, exact endpoint, independently approved IP set, and auth-policy agreement before sending a credential. DNS data cannot supply a token path, CA, fingerprint, API key, or permission to connect. Redirects are rejected. Private CA configuration is confined to this plugin's HTTPS agent.

The password input clears when submitted. Validated keys are retained only in the Host's memory, bound to the endpoint/certificate/IP/auth identity. They are not included in state responses, logs, disk files, or the recovery journal. Disconnecting leaves them available for this run. Explicitly forgetting the key, exiting Harness, or reloading/unloading the plugin clears them. A failed replacement preserves the previous valid key. Forgetting a session key disconnects the corresponding active route and returns to an optional `tokenFile` fallback; it never deletes a credential file.

## Demo compatibility

`demoMode: true` is an explicit integration setting for the separate demo repository. It selects the legacy `/_demo/capabilities` route, registers the fixed read-only `demo_read_marker` tool, and enables the Mock-only Host-context metadata convention. The default is false: ordinary installations register no demo tool and send no `demo_context_indices` metadata. The legacy capabilities/trust schema names remain accepted for existing deployments. Do not enable demo mode for unrelated production services.

Changing language changes only presentation. Addresses, protocol identifiers, model IDs, credentials and connection identity stay unchanged.
