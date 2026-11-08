#!/bin/sh
# Pure event classifiers shared by watchers and shell regression checks.
miller_key_skips_intro() {
    case "$1" in
        *' => 1')
            code="${1%% *}"
            case "$code" in 113|114|115|116|142) return 1 ;; esac
            return 0
            ;;
    esac
    return 1
}
miller_power_event() {
    case "$1" in
        *'"state":"ActiveStandby"'*|*'"state":"Suspend"'*|*'"state":"PowerOff"'*|*'"processing":"RequestPowerOff"'*|*'"processing":"RequestSuspend"'*) printf 'arm
' ;;
        *'"state":"Active"'*)
            case "$1" in *'"processing":'*) printf 'ignore
' ;; *) printf 'wake
' ;; esac
            ;;
        *) printf 'ignore
' ;;
    esac
}
