# Optional startup and Home-button integration

First complete the [README's manual install](../README.md#3-install-and-launch).
This integration targets the legacy **LG Input Hook 1.4.0 PHP-hook layout** and
`lginput2`. It is not a universal installer for every webOS generation.

## Prerequisites

1. Install and configure [LG Input Hook](https://github.com/Simon34545/lginputhook)
   for your TV. The validated older TV used 1.4.0 with its `libcrypt1` variant.
   Newer 1.5.x layouts differ and must not be substituted blindly.
2. On affected webOS versions below 4.0, Homebrew needs the persistent native
   ActivityManager fix from [upstream PR #230](https://github.com/webosbrew/webos-homebrew-channel/pull/230).
   Use a build containing that fix. Miller's IPK does not patch Homebrew.
   The validated source revision and build identity are recorded in
   [the build manifest](../tv/hbc-native-autostart-build.json).
3. Keep root SSH working and have a recovery path before changing boot hooks.
   Use the native Homebrew startup activity, not the obsolete input-app helper.
4. For a startup movie, add your local MP4, rebuild, and reinstall the app first.

## Stage the files

In the same PowerShell session used for installation (`$sshArgs` and `$tvTarget`
come from README step 3):

```powershell
./tools/tv.ps1 -RemoteCommand 'mkdir -p /tmp/miller-tv-setup'
$startupFiles = @('tv/00-miller-debug', 'tv/50-miller', 'tv/keybinds.json',
    'tv/ensure-autostart.sh', 'tv/miller-watch.sh',
    'tv/remote-events.sh', 'tv/intro-state.sh')
if (Test-Path app/assets/intro/startup.mp4) {
    $startupFiles += 'tv/start-intro.sh'
}
scp -O @sshArgs @startupFiles "${tvTarget}:/tmp/miller-tv-setup/"
ssh @sshArgs $tvTarget
```

## Back up and install

The following commands run **in the TV shell**. Keep the printed backup path.

```sh
backupDir="/var/lib/webosbrew/miller-backup/setup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backupDir" /var/lib/webosbrew/init.d /var/lib/webosbrew/miller
echo "Backup: $backupDir"
for hook in 00-miller-debug 50-miller; do
    if [ -f "/var/lib/webosbrew/init.d/$hook" ]; then
        cp "/var/lib/webosbrew/init.d/$hook" "$backupDir/$hook"
    fi
done
if [ -d /home/root/.config/lginputhook ]; then
    cp -R /home/root/.config/lginputhook "$backupDir/inputhook-config"
fi
if [ -f /var/lib/webosbrew/miller/ensure-autostart.sh ]; then
    cp -R /var/lib/webosbrew/miller "$backupDir/scripts"
fi
cp /tmp/miller-tv-setup/*.sh /var/lib/webosbrew/miller/
cp /tmp/miller-tv-setup/00-miller-debug /var/lib/webosbrew/init.d/
cp /tmp/miller-tv-setup/50-miller /var/lib/webosbrew/init.d/
chmod 755 /var/lib/webosbrew/miller/*.sh
chmod 755 /var/lib/webosbrew/init.d/00-miller-debug /var/lib/webosbrew/init.d/50-miller
```

`tv/keybinds.json` maps **773** (Home on the tested remote) to the launcher.
Confirm your remote's code using Input Hook. On a fresh or empty configuration,
install the provided mapping below. With existing bindings, merge that one entry
into your JSON manually; the command deliberately leaves nonempty files alone.

```sh
mkdir -p /home/root/.config/lginputhook
bindings=/home/root/.config/lginputhook/keybinds.json
if [ ! -f "$bindings" ] || [ "$(tr -d '[:space:]' < "$bindings")" = '{}' ]; then
    cp /tmp/miller-tv-setup/keybinds.json "$bindings"
else
    echo 'Keep existing bindings; merge the provided Home entry manually.'
fi
sh /var/lib/webosbrew/init.d/00-miller-debug
sh /var/lib/webosbrew/init.d/50-miller
exit
```

Homebrew runs executable hooks in `/var/lib/webosbrew/init.d` on boot.
`50-miller` initializes the legacy input hook and launches Miller TV without
blocking Homebrew. If `start-intro.sh` is installed, it also starts the wake/key
watchers for movie playback. On a fresh setup without a movie, leave that script
out to launch the carousel directly. Existing installations switching away from
movies must deliberately remove or restore their optional script; staging files
does not remove an older installed copy.

`ensure-autostart.sh` restores Home settings and logs locally. It does not launch
an input helper, mount an EIM overlay, or repair Homebrew's own boot registration.

## Test startup and recover

- Test Home while another app is open.
- Test a full boot without opening Homebrew.
- Test normal remote off/on separately: standby/wake behavior differs by TV.
- If launch works only after opening Homebrew, inspect its native boot activity
  and legacy fix instead of adding delays to Miller's script.

To bypass Miller's optional hook, run this from the computer:

```powershell
./tools/tv.ps1 -RemoteCommand 'touch /var/lib/webosbrew/miller-disabled'
```

The bypass applies at the next hook invocation and prevents new intro launches
from the power watcher. It does not undo an already injected Home mapping or
remove Homebrew SSH or the debugger firewall. Restore your backed-up key mapping
before uninstalling the launcher. Inspect your backups before restoring other
settings. After correcting the setup, remove `miller-disabled` to re-enable it.

Useful local logs: `/tmp/miller-startup.log`, `/tmp/miller-home-inject.log`,
`/tmp/miller-watch-power.log`, and `/tmp/miller-intro-events.log`.
Review and redact logs before sharing them.
