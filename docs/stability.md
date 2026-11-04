# Stability behavior (0.5.3)

Environmental changes are state transitions, not generic operation failures.
The Host opts into discovery-core's `waitForNetwork` mode.

| Situation | Behavior |
| --- | --- |
| Startup with no IPv4 or an old configured address | Initialization succeeds; page shows **Waiting for network**, without a red error. |
| Switching networks, interface detachment, transient multicast failure | Old candidate records are invalidated. Discovery waits and retries without repeated error events. |
| Selected network returns | Discovery resumes automatically; stale socket packets are ignored. |
| Previously connected service disappears or its transport fails | Connection is marked unavailable; saved keys and user model selection remain intact. |
| Clicking a service just as it disappears | Control response carries `SERVICE_UNAVAILABLE`; page shows neutral, translated status. |
| Service reappears | User can reconnect; trust and credentials are revalidated before replacing the old transport. Discovery alone does not reconnect. |
| Host restarts or browser-to-Host connection temporarily drops | Controls are disabled, a reconnecting status appears, polling restores usability without a sticky error. |
| Repeated start/stop, shutdown during bind | Operations serialize; sockets and retries are cleaned up, queued starts do not resurrect a closed controller. |
| Closing while credential retrieval is pending | No late request is sent after the transport is closed. |
| Interrupted inference stream | Request terminates with temporary-unavailability information and releases its response. It is not replayed automatically. |
| Invalid configuration, denied permissions, failed trust/authentication, malformed protocol | These remain errors rather than being hidden as offline status. |

Stopping discovery alone does not disconnect an already verified API route.
After a network change, an unavailable default route can be explicitly disconnected
to restore the previous default; another model selected by the user is respected.
No network settings, trust files, saved credentials, or default models are rewritten
in response to network events.

A configured `interfaceAddress` remains pinned. If the machine moves to a different
network, waiting is intentional; returning to the selected network resumes scanning.
Automatic interface selection and cross-network service migration are outside this
change. Inference against an unavailable service cannot succeed silently: it ends
with a clear availability message instead of fabricating output or retrying tool calls.

## Verification

Run `npm run build`, `npm test`, and `npm run verify:release -- <archive>`.
Regression coverage includes unavailable startup, recovery and repeated network loss,
old attachment IDs, shutdown during bind, permission failures, offline routes and
credential retention, reconnect without duplicate providers, Host outages, localized
neutral UI states, and stream/credential races.

The automated suite contains 61 plugin tests; discovery-core 0.3.2 has 20 tests.
These use controlled network interfaces, transports and the actual bundled browser
contribution. The installed Desktop acceptance below is separate.

## Physical macOS Desktop acceptance — 2026-11-04

The `0.5.3-stability.1` candidate was installed using the bundled CLI in Harness
Desktop `0.2.1-rc.5` on Apple Silicon. Version 0.5.3 promotes the same runtime code;
release version, documentation and the packaged core version are updated separately.

- Original unavailable interface configuration: the real page showed **Waiting for
  network**, without **Operation failed**.
- A separate local Demo fixture withdrew its text service through authenticated
  control: real mDNS removal and HTTPS 503 coincided with the service disappearing
  from the page and a neutral unavailable message. Other services remained visible.
- Reannouncement, explicit reconnection and a new Desktop conversation succeeded.
- Wi-Fi was physically disabled and restored. Its IPv4 address disappeared and the
  default route moved to Ethernet, then returned to Wi-Fi. Synchronized local UI
  captures showed waiting during the outage and automatic discovery after recovery.
- A new Desktop conversation after explicit reconnection completed over HTTPS.
- The original trust/interface configuration was restored after testing. Credential
  file SHA-256 remained identical; the original Demo instance, keys and certificates
  were retained. The existing recovery journal restored the previous default model
  on the initial cold start, as designed.

The APIs were deterministic Demo fixtures, not real model inference. This run
qualifies Wi-Fi loss/restoration with Ethernet failover, not roaming between SSIDs,
Linux Web UI, or new Desktop targets. No private profile, credential, certificate,
raw screenshot or local machine path is included in the public release record.
