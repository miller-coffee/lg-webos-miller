#!/bin/sh
# Native ActivityManager now boots HBC. Never launch input apps from this hook.
[ ! -e /var/lib/webosbrew/miller-disabled ] || exit 0
log=/var/lib/webosbrew/miller/boot-history.log
printf '%s boot=%s native-activity-startup
' "$(date -u +%FT%TZ)" "$(cat /proc/sys/kernel/random/boot_id)" >> "$log"
luna-send -n 1 -w 3000 luna://com.webos.settingsservice/setSystemSettings '{"category":"general","settings":{"homeAutoLaunch":"off","homePromotion":"off"}}'
