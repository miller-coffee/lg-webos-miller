# Miller TV

A minimal app carousel for rooted LG webOS TVs, with remote navigation,
editable app selections, a 24-hour clock and ISO date, animated bunny and giraffe
companions, warm selection lighting, and optional local startup media.

Developed for the older webOS 3.x JavaScript engine. Test compatibility on your
own hardware; newer desktop browsers alone do not establish TV compatibility.

## Build and preview

Requires a current Node.js runtime and `tar`; there are no npm runtime dependencies.

```sh
npm test
npm run build
npm run preview
```

The generated IPK is written to `dist/`. The preview binds only to localhost.
Use Up/Down or the remote wheel to browse, OK to launch, and Right for controls.
`Edit apps` changes the launcher's app list without uninstalling applications.

## Local customization

The public background is an original abstract desert SVG. For a personal
background, add `app/assets/background.local.png` locally. It is ignored by Git
and layered above the default artwork. The build includes local customization
files; do not publish your locally customized IPKs.

Startup movies are optional. Add your own H.264/AAC video at
`app/assets/intro/startup.mp4`. Personal media, local manifests, generated
packages, and development screenshots are excluded from version control.

The sprite sheets and app icons are bundled for offline rendering. The Anton
font's SIL Open Font License is included in `app/assets/fonts/OFL.txt`.
Brand icons and third-party components retain their respective ownership.

## TV connection and development

Copy `tv/device.example.json` to `tv/device.json`, then configure the TV hostname
locally. The real configuration is ignored by Git. Keep the owner SSH key and
verified host-key record in the ignored `.local/` directory; the helpers expect
`tv_owner_ed25519` and `known_hosts` respectively. Never publish these files.

```powershell
./tools/tv.ps1 -RemoteCommand 'id; uptime'
./tools/tv-debug.ps1 -Action Enable
$env:MILLER_TV_DEBUG_ENDPOINT = 'http://127.0.0.1:19998'
node tools/check-tv.mjs --carousel --interactions --editor
./tools/tv-debug.ps1 -Action Disable
```

Direct LAN access to the TV debugger must remain blocked. `tv/00-miller-debug`
restricts TCP 9998 to loopback; debugging uses the authenticated, localhost-only
SSH tunnel. Close the tunnel after every session, including failed validation.
Verify IPv6 behavior separately if the firmware or debugger bind addresses change.

## Persistent startup

Homebrew Channel's legacy ActivityManager startup fix is required on affected
older TVs. The upstream source commit, build command, target runtime and artifact
hash are recorded in `tv/hbc-native-autostart-build.json`. Preserve that fix when
maintaining Homebrew; the obsolete input-app workaround is not reliable.

The persistent native Homebrew activity invokes its startup script, which runs
`tv/50-miller` as an optional initialization hook. That hook initializes the Home
mapping and starts the launcher and wake/key watchers. `tv/ensure-autostart.sh`
restores Home settings and logs locally; it does not launch an input helper or
require an EIM overlay. The provided key mapping targets the launcher from Home.

Create `/var/lib/webosbrew/miller-disabled` to bypass the optional Miller startup
hook. Preserve and inspect your own backups before restoring any device settings.
No firmware or kernel image is part of this repository.

## Validation and privacy

`npm test` covers launcher navigation, app editing, intro behavior, animation
control and package contents. `tools/check-tv.mjs` also compiles the application
scripts in the actual legacy TV engine through the private tunnel.

This repository contains a fresh public history. Device addresses, hardware
identifiers, SSH fingerprints, personal photos, private startup media, diagnostic
logs and local credentials are excluded. Loopback addresses in development tools
are generic local endpoints, not device identifiers. Do not add private details
to documentation, commits, screenshots or release artifacts.

Run `npm run audit:public` to scan tracked files and all reachable Git history
for common credentials, device identifiers, private files and image metadata.
