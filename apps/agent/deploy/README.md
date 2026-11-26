# Installing the store agent as a service

**Untested templates** (listed in `docs/gaps.md`). Phase 2 replaces these with one-click installers.

The agent needs Node.js 22.13 or newer on the store PC. It plugs into the back-office network port, next to the Commander, and only makes outbound HTTPS connections.

Before installing on any OS:

1. Copy `agent.config.example.json` to the install folder as `agent.config.json` and fill it in.
2. Run `npx tsx src/main.ts test-connection --config agent.config.json`. Confirm the certificate fingerprint against the Commander, then paste it into `commander.certFingerprint256`.
3. Run `once`. It should log captured periods and exit 0.

Keep secrets out of the file by setting `CSF_AGENT_KEY` and `CSF_COMMANDER_PASSWORD` in the service's environment.

| OS | Template | Install |
| --- | --- | --- |
| Linux | `linux/cstoreflow-agent.service` | Copy to `/etc/systemd/system/`, create `/etc/cstoreflow/agent.env`, then `systemctl enable --now cstoreflow-agent` |
| macOS | `macos/com.cstoreflow.agent.plist` | Copy to `/Library/LaunchDaemons/`, then `launchctl bootstrap system /Library/LaunchDaemons/com.cstoreflow.agent.plist` |
| Windows | `windows/install.ps1` | Run in an elevated PowerShell. Uses the built-in `sc.exe` through a small wrapper (NSSM or WinSW recommended for Phase 2) |
