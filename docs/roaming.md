# Network roaming: office to home

Candidate version: plugin `0.6.0-roaming.1`, discovery-core `0.4.0-roaming.1`.

A user can move between networks while keeping Harness open. Automatic discovery
selects an available LAN interface, discards candidates from the previous attachment,
and discovers services on the current network. The familiar analogy is finding a
nearby printer or choosing a Wi-Fi network: the list describes what is available
here, while choosing and authorizing a connection remain separate user actions.

The plugin discovers LLM API endpoints. It does not connect Wi-Fi, configure a
router, provide an Internet relay, or migrate an in-flight inference request.

## Enable automatic mode

Merge the following fields into the existing `lan-discovery` entry in the active
Harness profile. Preserve the existing trust path, state path, other plugins,
credentials and model settings. The absolute paths below are examples.

```yaml
- id: lan-discovery
  name: dsh-lan-discovery
  config:
    trustFile: '/Users/alice/llm-discovery/trust.json'
    stateFile: '/Users/alice/llm-discovery/plugin-state.json'
    interfaceMode: auto
    autoStart: true
```

There is no need to remove an old `interfaceAddress` field when migrating: explicit
`interfaceMode: auto` ignores it for discovery selection. Keeping it makes rollback
to pinned mode possible without losing the old value. This configuration change
does not rewrite network settings or distribute keys to newly discovered services.

For Desktop upgrades or profile changes, disconnect an active LAN model, fully quit
Harness, install/update the plugin with its bundled CLI, then reopen. The existing
rc.5 hot-reload recovery limitation remains; see [platform support](platform-support.md).

### Prefer a physical adapter

To prefer Wi-Fi on a machine with Ethernet, add its actual OS device name:

```yaml
    interfaceMode: auto
    preferredInterfaceName: en0
```

`preferredInterfaceName` follows the adapter when DHCP gives it a new IPv4 address.
Use `listIPv4Interfaces()` from the core library or the Demo's `list-interfaces`
command to inspect names. Names differ by OS and machine: `en0`, `wlan0`, and
`Wi-Fi` are examples, not portable aliases.

Selection order is:

1. The preferred physical adapter, when it has a usable IPv4 address.
2. A physical adapter with a usable default-route hint, ordered by route metric.
3. The previously selected physical adapter, if still available.
4. A stable adapter-name/address order among the remaining physical adapters.

Recognizable VPN, container and virtual adapters are excluded from automatic
selection. Assigned IPv4 addresses are preferred to link-local addresses; a
physical LAN with only link-local IPv4 can still be selected. If no eligible LAN
is available, discovery waits. An intentional VPN or virtual-network deployment
can use explicit pinned mode. Only one attachment is scanned at a time.

## Existing configurations remain compatible

| Configuration | Effective behavior |
| --- | --- |
| No mode and no `interfaceAddress` | Automatic discovery for a new installation. |
| No mode, with an existing `interfaceAddress` | Preserve the existing pinned-address behavior. |
| `interfaceMode: auto`, with or without an old address | Follow a usable LAN; the old address does not pin discovery. |
| `interfaceMode: pinned` with `interfaceAddress` | Use that exact local IPv4 address; wait when it is absent. |

For an explicitly pinned setup:

```yaml
    interfaceMode: pinned
    interfaceAddress: '192.168.1.20'
```

The core library keeps its previous default behavior for direct SDK consumers.
The new-install default described here is the Harness plugin's configuration policy.

## What happens during a move

| Stage | Discovery and API behavior |
| --- | --- |
| Company network | Company candidates appear. The user checks and connects to an authorized API. |
| Detachment | Old candidates are invalidated and previous routes become unavailable. Saved keys and the user's selected model remain intact. |
| Between networks | The page shows a normal waiting state. It does not repeatedly report a generic operation failure. |
| Home network | Discovery rebinds to the selected home interface and creates a fresh attachment. Responses from the old socket are ignored. |
| Home service discovered | Its information appears. Discovery alone does not select a model or reconnect an API route. |
| Explicit connection | The endpoint, approved addresses, certificate identity, authentication policy and credentials are checked before the route is created or replaced. |
| Disconnect | The existing conditional restoration mechanism restores the previous default when the user has not selected another model in the meantime. |

Old routes cannot send new inference requests while unavailable. An interrupted
stream ends with availability information; the plugin does not replay requests or
tool calls automatically. Stopping discovery manually remains separate from a
network detachment: stopping the scan alone does not disconnect a verified route.

Services with the same display name on different networks do not share an identity.
Saved credentials are scoped to the independently approved endpoint, certificate,
resolved approved addresses and authentication policy. A home API cannot inherit
a company API key by choosing the same service name. The same already authorized
service may reuse its saved credential after explicit revalidation, even when the
discovery attachment ID changes.

The configured `networkId` is an application label; it is not an observed SSID,
gateway identity, credential namespace or authorization grant. OS attachment hints
never replace it. Independent trust entries must cover the intended company and
home services before either is connected; discovery does not automatically extend
the trust document.

## Same IPv4 on different networks

Two networks can assign the same client IPv4 address. Automatic selection therefore
also reads default-route and cached gateway-identity hints where the OS permits:

- macOS: bounded read-only `route` and `arp` commands.
- Linux: `/proc/net/route` and `/proc/net/arp`.
- Windows: bounded PowerShell `Get-NetRoute` and `Get-NetNeighbor` queries.

The process does not change routes, populate an ARP cache by probing other hosts,
request SSID/location permission, or contact an external service. Missing OS tools
fall back to interface-based selection. An incomplete neighbor entry does not
erase an already learned identity; learning the first MAC is metadata enrichment,
while a later changed MAC invalidates the old attachment.

This is best-effort detection. If the interface, client IPv4, gateway and available
gateway identity all remain unchanged, polling cannot prove a network move. Cached
neighbor information can also update after the actual transition. Consequently
the default two-second polling interval is not a guaranteed end-to-end switch time.
An embedding host can provide a stronger network identity through the core's
`resolveNetworkAttachment({ interfaces, previous, signal })` hook. That hook is
an SDK integration seam, not a YAML field or a user-controlled trust override.

## Verification and remaining acceptance

The candidate's core suite covers 30 checks, including office → no network → home,
direct attachment replacement, same-IP identity changes, stale socket rejection,
unrelated-adapter stability, first-neighbor-identity enrichment, strict pinned
compatibility and cancellation of pending probes/binds.

The plugin suite covers 65 checks. Its roaming integration tests use the actual
bundled core, controller, Fetch handler and Host credential adapter with controlled
network transports. They verify old-route unavailability, unchanged defaults and
saved keys, same-name endpoint/certificate/key isolation, explicit home connection,
restoration on disconnect, and same-service transport replacement without duplicate
providers. Package verification separately installs the final archive with an empty
npm cache in offline mode and validates the shipped Host/browser modules.

Those checks do not establish physical roaming between two SSIDs or LANs. Actual
multi-adapter selection, Wi-Fi/Ethernet handover, same-subnet reuse and OS-specific
gateway-cache behavior still require physical acceptance on each target platform.
A controlled experiment using real UDP/HTTPS with injected attachment changes must
be labelled as such; it cannot be reported as a physical office-to-home transfer.
The earlier [0.5.3 stability acceptance](stability.md) demonstrates Wi-Fi loss and
restoration, not automatic discovery on a different physical network.

For physical acceptance, record versions and the selected interface, keep a local
screen recording through the transition, verify company candidates disappear and
home candidates appear, reject the old route, explicitly connect to an independently
trusted home service, complete a new request, and verify credentials/defaults were
not rewritten by the network event. Returning to the company network should repeat
the same discovery and explicit-connection sequence.

## 中文摘要

像查找当前网络中的打印机一样，用户从公司回家后可以重新看到家庭网络提供的
LLM API，再选择接入。启用 `interfaceMode: auto` 即可解除旧 IPv4 对发现的锁定；
可用 `preferredInterfaceName` 优先跟随某张物理网卡。旧配置未显式启用自动模式时
继续保留固定地址行为。

换网自动更新的是候选列表，不是服务授权、凭据或默认模型。新服务需要独立的信任
配置及显式连接；同名服务不能继承另一服务的 key。同 IPv4 网络通过网关身份作
尽力区分，实际双网络与多网卡漫游仍需按目标平台完成实机验收。
