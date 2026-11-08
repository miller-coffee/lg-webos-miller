# Miller TV development and debugger security

The user explicitly requested that network debugging stay disabled between work
sessions and that we remember to re-enable debugging when working on the TV again.

- Direct LAN access to TCP 9998 is blocked by the persistent
  `/var/lib/webosbrew/init.d/00-miller-debug` hook (source: `tv/00-miller-debug`).
  Keep that protection in place. Do not expose the debugger to the LAN again.
- When TV development requires the real JavaScript engine, open an authenticated
  SSH tunnel with `./tools/tv-debug.ps1 -Action Enable`. The tunnel binds only to
  `127.0.0.1:19998` on this computer. Existing user authorization covers temporarily
  opening this development tunnel; no repeat permission question is needed.
- Set `$env:MILLER_TV_DEBUG_ENDPOINT = 'http://127.0.0.1:19998'`, then run
  `node tools/check-tv.mjs` (and appropriate optional flags). Use this endpoint for
  further TV debugger clients. Do not use direct LAN access to port 9998.
- Close the tunnel with `./tools/tv-debug.ps1 -Action Disable` at the end of work,
  including when validation fails. Do not leave a background tunnel running.
- SSH on port 22 remains available for installation and administration. Preserve
  its working owner key, host-key pinning, and all TV startup/UI features.
- The firmware lacks IPv6 filter-table support. At setup the debugger listened
  on IPv4 only. If its bind addresses change, re-check IPv6 exposure before
  claiming that direct network debugging is blocked.
- Keep the existing legacy-JavaScript engine checks: modern browser tests alone
  missed a strict-mode block-function syntax error on this TV previously.

- The TV address is stored in the ignored local file `tv/device.json`.
  Both SSH helpers read that file; use `tv/device.example.json` as a template.
  Verify device identity against the pinned local SSH host record before changing
  its address. Never publish device addresses, hardware identifiers, fingerprints,
  private photos, personal media, or diagnostic logs.

- Boot uses the persistent native Homebrew ActivityManager activity, with the
  service.js legacy fix from official commit 1a2b969e992617c9ba4b8a891542cb93a9e07b0a.
  Preserve this fix when maintaining/updating Homebrew. Build and rollback details
  are in tv/hbc-native-autostart-build.json and README.md.
- tv/ensure-autostart.sh intentionally does not launch an input helper or depend
  on an EIM overlay. The old input-app boot workaround was unreliable.
