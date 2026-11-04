# Platform support and acceptance

Updated 2026-11-04. This record distinguishes portable package checks from an installed Harness connecting to real LAN services. The plugin downloads no model weights and contains no native addon or platform executable; Node.js and Harness themselves must support the target OS and architecture.

## 0.5.3 stability evidence

The local macOS ARM64 build passed 61 plugin tests, while discovery-core 0.3.2 passed
20 tests. Empty-cache offline installation and shipped browser/Host checks passed.
The release workflow separately verifies the final tag on the five package targets.

Actual rc.5 Desktop acceptance of the stability candidate passed unavailable-network
startup, service withdrawal and restoration, real Wi-Fi loss with Ethernet failover,
automatic discovery recovery, and explicit reconnect with completed HTTPS responses.
The existing profile's network/trust settings and saved credentials were retained.
See [the detailed scope](stability.md#physical-macos-desktop-acceptance--2026-11-04).
The historical functional checks below remain version-specific; this stability run
is not a new image/tool/credential-entry acceptance on every platform.

## 0.5.2 package and Host evidence

| Target | Package evidence | Live Host and network evidence |
|---|---|---|
| Windows x64 | Candidate code: 51 tests passed locally; build, tests, and empty-cache offline tarball installation passed in CI. | Historical rc.3/rc.5 Desktop acceptance is recorded in the Demo validation report. |
| Linux x64 | Candidate code: build, 51 tests, and empty-cache offline tarball installation passed in CI. | Official CLI/Web integration with this plugin has not been accepted. |
| Linux arm64 | Candidate code: build, 51 tests, and empty-cache offline tarball installation passed in CI. | Not accepted. |
| macOS Apple Silicon | Candidate code: build, 51 tests, and empty-cache offline tarball installation passed in CI. | Actual rc.5 Desktop checks with 0.5.2-macos.1 passed installation, English/Chinese, discovery/lifecycle, text, image, native tools, authentication, credential persistence, and cold-start default-model recovery. See the reload boundary below. |
| macOS Intel | Candidate code: build, 51 tests, and empty-cache offline tarball installation passed in CI. | Desktop integration has not been accepted. |

All five targets passed [candidate CI run 41668508007](https://github.com/nobrowning/dsh-lan-discovery/actions/runs/41668508007) at code revision `6786bff`. This run verifies the code prepared for 0.5.2; its package version was the prerelease candidate. The final version tag runs the release matrix separately. The Demo [validation report](https://github.com/nobrowning/llm-service-discovery-demo/blob/main/docs/validation-report.md) records the actual artifact versions, interactions, and remaining acceptance checks.

Version 0.5.2 fixes blank discovery warning/error causes by retaining the core's error string in the UI event record. The controller removes control characters, bounds the displayed reason, and retains only the event fields intended for the UI. Existing service-removal reasons remain intact. Host-boundary and browser-bundle regressions cover the change. The archive verifier also matches checksum entries by the exact filename, including prerelease names such as `0.5.2-macos.1`.

## Package verification scope

Both workflows now declare five targets: Windows x64, Linux x64 and arm64, macOS arm64 and x64. They check `process.platform` and `process.arch`, then build, test, pack, and install with an empty npm cache in offline mode. The package verifier canonicalizes temporary paths, checks that dependencies resolve inside the isolated installation, and exercises the shipped Host modules and browser bundle. A regression runs this check through a temporary-directory alias; on Windows with Git installed it also exercises GNU tar instead of assuming the system tar implementation.

The Release attaches one Linux x64-produced archive for all targets. Other CI archives are diagnostic build outputs, not separate architecture-specific plugins. npm can preserve different executable mode bits for a bundled dependency when packing on Windows; matching source contents need not yield identical archive hashes across builders. Consumers verify the published archive against its own `SHA256SUMS`.

The five-platform CI result qualifies the portable package checks, not five installed Harness sessions. The current Windows x64 check passed all **51 tests**. Live GUI and network evidence is recorded separately below.

## Actual macOS Harness checks

The physical Apple Silicon Mac runs macOS 27.2 (`darwin/arm64`) and **DeepSeek Harness Desktop 0.2.1-rc.5**, with its bundled **Node.js 24.21.0 / Electron 44.7.0**. The application was launched to initialize its profile, fully quit, and given `dsh-lan-discovery-0.5.2-macos.1.tgz` through its own bundled CLI. This is an actual Desktop session, separate from the earlier package-only validation and its external Node.js 24.22.2.

The recorded GUI checks passed page registration, English/Chinese switching, real discovery of three native Demo services, service withdrawal/reappearance (**3 → 2 → 3**), a key-free text conversation, missing/wrong-key rejection, disconnect restoration of the previous default, and cold-start default-model recovery. The actual Desktop also passed image attachment (91-byte, 16×16 PNG with matching SHA-256), native tool execution with correlated call/result/response evidence, saving GLM credentials, and using Qwen credentials for the current run only. After a full restart, GLM completed a new session without key re-entry and Qwen required a key again.

An isolated **official Web Host on the same Mac** additionally verified authenticated controls, credentials, actual image bytes, and native tool-call/result correlation. That evidence covers those official Host interfaces on macOS. It does not constitute Desktop GUI acceptance for those interactions or a Linux Web UI acceptance run.

**Reload boundary:** disabling and re-enabling the plugin while a LAN model is active can make rc.5 reject automatic default recovery with `HMR transactions cannot be nested`. The recovery journal remains intact and the page shows recovery as pending. Clicking **Disconnect and restore default** after reload successfully restores the original model and clears the journal. Disconnect before disabling, upgrading or uninstalling the plugin; a successful cold-start check does not imply seamless hot reload.

Initially Desktop reported `EHOSTUNREACH` while command-line network checks succeeded. After the user enabled **System Settings → Privacy & Security → Local Network → DeepSeek Harness**, Desktop discovery succeeded and this error disappeared. Version 0.5.2 makes the underlying warning/error cause visible in the plugin's event record. Inspect that record and the selected interface before attributing a new failure to permissions; VPNs, firewalls, routing, and ordinary mDNS coexistence can also affect discovery.

Apple documents that command-line programs launched from Terminal or SSH can access the local network automatically, so their success does not demonstrate a GUI application's permission. macOS does not require the iOS multicast entitlement. Follow the actual application's system prompt and permission state; see [Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy). The [Mac Desktop quickstart](https://github.com/nobrowning/llm-service-discovery-demo/blob/main/docs/mac-desktop-quickstart.md) provides native service commands, profile merging, permissions, and repeatable UI acceptance steps.

## Historical 0.5.1 component verification

All five 0.5.1 targets passed [CI run 41654575829](https://github.com/nobrowning/dsh-lan-discovery/actions/runs/41654575829) at revision `ce4a85e37265b4f7f7772a6e386260068aea1139`, with 49 tests per target. A separate physical Apple Silicon Mac (`darwin/arm64`, Darwin 27.2.0) and Ubuntu WSL2 (`linux/x64`, kernel 6.18.40.1-microsoft-standard-WSL2), both using Node.js 24.22.2, also received clean Git source archives and component tarballs in dedicated validation directories. Both passed dependency installation, all 49 plugin tests, bundle construction, verification of the supplied archive, and empty-cache offline installation of locally rebuilt archives. At that stage no Harness application was installed and no live LAN service was started for those component checks; the later macOS Desktop run above supersedes that installation status.

The same runs also passed discovery-core 0.3.1's 14 tests and advertiser 0.3.1's 20 tests, plus installed-package checks. Mac arm64 and Linux x64 rebuilt the same bytes for all three component archives. These component results do not establish actual multicast reachability, Desktop UI behavior, or Linux Web Host compatibility.

The historical local Windows x64 check with Node.js 24.21.0 passed the build and all 49 tests, including package verification through an aliased temporary directory and the Git GNU tar path. These results remain 0.5.1 package-level evidence; they are not a new Desktop acceptance run.

## Host installation boundary

The plugin allows the reviewed `@deepseek-ai/dsh` interfaces at **0.2.1-rc.3 and 0.2.1-rc.5**. A package import check does not invoke the Host's profile loader or establish that its optional peer packages are available. A different version needs an interface review and live acceptance.

The official [Desktop packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/packaging/README.md) lists Windows x64 and macOS arm64/x64 as build targets, and excludes Linux as a supported Desktop release target. This does not establish that every supported Harness version has a downloadable Desktop asset on every architecture. Check the actual installed application's bundled version.

For Desktop, launch the app once to initialize its profile, then fully quit before installation. On macOS use the application's `Contents/Resources/runtime/cli/bin/dsh` shell launcher; on Windows use `resources/runtime/cli/bin/dsh.cmd`. Keep the existing plugins and model settings when merging the `lan-discovery` override into the active home's `profiles/desktop/cordis.patch.yml`; the profile may not yet contain that override. For Linux, the documented evaluation route uses the official pinned CLI and its `web` profile. It does not use `--profile desktop` or assume compatibility with a community Electron wrapper. See [installation commands](../README.md#download-and-install) and the [official CLI help](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md).

## Live acceptance needed for each new Host target

Record the OS, CPU architecture, Node and Harness versions, installer/CLI provenance, plugin artifact SHA-256, and selected LAN interface. Then verify:

1. Installation, page/sidebar registration, authenticated control routes, and English/Chinese changes.
2. Real multicast discovery, service withdrawal/reappearance, and direct HTTPS using an independently provisioned trust document.
3. No-key connection, wrong-key rejection, saved-key connection after restarting the Host, and session-only key removal.
4. A streamed text conversation, image attachment, and tool round trip for services declaring those capabilities.
5. Disconnect, plugin reload, and cold-start recovery of the previous default model.

Discovery occurs on the Host computer, not in the browser. Ensure the chosen IPv4 interface can reach multicast UDP 5353 and the service's HTTPS port. Check coexistence with the machine's ordinary mDNS service, sleep/network changes, and applicable firewall or local-network permissions on the actual OS. Package CI does not simulate these conditions.

Use absolute native paths in configuration. Tilde and environment-variable placeholders in YAML are not expanded. A trust directory can be read-only when `stateFile` points to a writable user directory. Credential persistence/protection is owned by the active Harness provider; neither this plugin nor the OS label guarantees an encrypted key store.
