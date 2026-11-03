# Platform support and acceptance

Updated 2026-11-03. This record distinguishes portable package checks from an installed Harness connecting to real LAN services. The plugin downloads no model weights and contains no native addon or platform executable; Node.js and Harness themselves must support the target OS and architecture.

## Evidence before the 0.5.1 cross-platform release

| Target | Package evidence | Live Host and network evidence |
|---|---|---|
| Windows x64 | 0.5.0 build, 48 tests, and empty-cache offline tarball installation passed in CI and locally. | rc.3/rc.5 Desktop acceptance is recorded in the Demo verification report. |
| Linux x64 | 0.5.0 build, 48 tests, and empty-cache offline tarball installation passed in CI. | Official CLI/Web integration with this plugin has not been accepted. |
| Linux arm64 | 0.5.1 CI target added; no completed result recorded here yet. | Not accepted. |
| macOS Apple Silicon | 0.5.1 CI target added; no completed result recorded here yet. | Not accepted. |
| macOS Intel | 0.5.1 CI target added; no completed result recorded here yet. | Not accepted. |

The historical package run is [41605361694](https://github.com/nobrowning/dsh-lan-discovery/actions/runs/41605361694). The Demo [validation report](https://github.com/nobrowning/llm-service-discovery-demo/blob/main/docs/validation-report.md) records which native interactions were executed, with versions and limits. Old evidence is not counted as a new 0.5.1 acceptance run.

## 0.5.1 verification scope

Both workflows now declare five targets: Windows x64, Linux x64 and arm64, macOS arm64 and x64. They check `process.platform` and `process.arch`, then build, test, pack, and install with an empty npm cache in offline mode. The package verifier canonicalizes temporary paths, checks that dependencies resolve inside the isolated installation, and exercises the shipped Host modules and browser bundle. A regression runs this check through a temporary-directory alias; on Windows with Git installed it also exercises GNU tar instead of assuming the system tar implementation.

The Release attaches one Linux x64-produced archive for all targets. Other CI archives are diagnostic build outputs, not separate architecture-specific plugins. npm can preserve different executable mode bits for a bundled dependency when packing on Windows; matching source contents need not yield identical archive hashes across builders. Consumers verify the published archive against its own `SHA256SUMS`.

The configured 0.5.1 matrix is not yet a claim that its jobs passed. Record CI links, tested architecture, and live acceptance separately when they complete.

The local Windows x64 check with Node.js 24.21.0 passed the build and all **49 tests**, including the new package verification through an aliased temporary directory and the Git GNU tar path. This is package-level evidence, not a new native Desktop acceptance run.

## Host installation boundary

The plugin allows the reviewed `@deepseek-ai/dsh` interfaces at **0.2.1-rc.3 and 0.2.1-rc.5**. A package import check does not invoke the Host's profile loader or establish that its optional peer packages are available. A different version needs an interface review and live acceptance.

The official [Desktop packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/packaging/README.md) lists Windows x64 and macOS arm64/x64 as build targets, and excludes Linux as a supported Desktop release target. This does not establish that every supported Harness version has a downloadable Desktop asset on every architecture. Check the actual installed application's bundled version.

For Desktop, use its own `resources/runtime/cli/bin/dsh` shell launcher on macOS or `dsh.cmd` on Windows after its profile has been initialized by launching the app once. For Linux, the documented evaluation route uses the official pinned CLI and its `web` profile. It does not use `--profile desktop` or assume compatibility with a community Electron wrapper. See [installation commands](../README.md#download-and-install) and the [official CLI help](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md).

## Live acceptance needed for each new Host target

Record the OS, CPU architecture, Node and Harness versions, installer/CLI provenance, plugin artifact SHA-256, and selected LAN interface. Then verify:

1. Installation, page/sidebar registration, authenticated control routes, and English/Chinese changes.
2. Real multicast discovery, service withdrawal/reappearance, and direct HTTPS using an independently provisioned trust document.
3. No-key connection, wrong-key rejection, saved-key connection after restarting the Host, and session-only key removal.
4. A streamed text conversation, image attachment, and tool round trip for services declaring those capabilities.
5. Disconnect, plugin reload, and cold-start recovery of the previous default model.

Discovery occurs on the Host computer, not in the browser. Ensure the chosen IPv4 interface can reach multicast UDP 5353 and the service's HTTPS port. Check coexistence with the machine's ordinary mDNS service, sleep/network changes, and applicable firewall or local-network permissions on the actual OS. Package CI does not simulate these conditions.

Use absolute native paths in configuration. Tilde and environment-variable placeholders in YAML are not expanded. A trust directory can be read-only when `stateFile` points to a writable user directory. Credential persistence/protection is owned by the active Harness provider; neither this plugin nor the OS label guarantees an encrypted key store.
