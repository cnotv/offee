#!/usr/bin/env bash
# The launcher's server commands and VM size checks, against stand-ins for ssh, curl and docker:
# which commands run on the server, that a deploy proves Offee does not answer publicly, that
# the tunnel binds loopback only, and that setup refuses a VM too small for the model.
# Run it with: bash bin/offee.test.sh
set -Eeuo pipefail

launcher="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/offee"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

# ssh records each call, swallows the code archive piped to it, and answers the launcher's
# questions about the server: its address, whether setup finished, and its port.
cat > "$work/bin/ssh" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$OFFEE_TEST_LOG"
case "$*" in
  -G*) echo "hostname 192.0.2.1" ;;
  *"tar -x"*) cat > /dev/null ;;
  *setup-complete*) exit 1 ;;
  *settings.env*) echo 8470 ;;
esac
STUB
# curl reaches nothing, so setup can never get past its checks here and download or build.
# OFFEE_TEST_PUBLIC makes the server's public address answer, as a misconfigured one would.
cat > "$work/bin/curl" <<'STUB'
#!/bin/sh
case "$*" in *192.0.2.1*) [ "${OFFEE_TEST_PUBLIC:-0}" = 1 ] && exit 0 ;; esac
exit 7
STUB
printf '%s\n' '#!/bin/sh' 'exit 1' > "$work/bin/docker"
chmod +x "$work/bin/"*

export PATH="$work/bin:$PATH" OFFEE_TEST_LOG="$work/ssh.log" OFFEE_NO_BROWSER=1
failures=0

# Runs the launcher with a fresh state folder and ssh log; its output lands in $work/out.
run() {
  rm -rf "${work:?}/home" "$OFFEE_TEST_LOG"
  touch "$OFFEE_TEST_LOG"
  status=0
  OFFEE_HOME="$work/home" bash "$launcher" "$@" < /dev/null > "$work/out" 2>&1 || status=$?
  if grep -qE "stopped unexpectedly|unbound variable|integer expression" "$work/out"; then
    printf 'FAIL  offee %s crashed\n' "$*"; sed 's/^/      /' "$work/out"; failures=$((failures + 1))
  fi
}

expect() {
  local file="$1" text="$2" what="$3"
  if grep -qF -- "$text" "$file"; then printf 'ok    %s\n' "$what"
  else printf 'FAIL  %s: no "%s" in\n' "$what" "$text"; sed 's/^/      /' "$file"; failures=$((failures + 1)); fi
}

expect_status() {
  local wanted="$1" what="$2"
  if { [ "$wanted" = 0 ] && [ "$status" = 0 ]; } || { [ "$wanted" != 0 ] && [ "$status" != 0 ]; }; then printf 'ok    %s\n' "$what"
  else printf 'FAIL  %s: exit status %s\n' "$what" "$status"; sed 's/^/      /' "$work/out"; failures=$((failures + 1)); fi
}

run remote box deploy --runtime docker --yes
expect_status 0 "deploy succeeds when the server is private"
expect "$OFFEE_TEST_LOG" "box rm -rf offee.new" "deploy copies the code to the server"
expect "$OFFEE_TEST_LOG" "-t box OFFEE_NO_BROWSER=1 offee/bin/offee setup --runtime docker --yes" "deploy runs setup on the server with its options"
expect "$work/out" "does not answer on 192.0.2.1:8470" "deploy proves Offee is not public"
expect "$work/out" "offee remote box tunnel" "deploy says how to reach it"

OFFEE_TEST_PUBLIC=1 run remote box deploy
expect_status 1 "deploy fails when the server's public address answers"
expect "$work/out" "answers on 192.0.2.1:8470" "deploy names the public address"

run remote box tunnel --port 9999
expect "$OFFEE_TEST_LOG" "-N -o ExitOnForwardFailure=yes -L 127.0.0.1:9999:127.0.0.1:8470 box" "the tunnel binds loopback on both ends"

run remote box switch ask
expect "$OFFEE_TEST_LOG" "-t box OFFEE_NO_BROWSER=1 offee/bin/offee switch ask" "other commands run on the server"

run remote -oProxyCommand=evil deploy
expect_status 1 "a host that looks like an ssh option is refused"
[ -s "$OFFEE_TEST_LOG" ] && { echo "FAIL  ssh ran with an option as host"; failures=$((failures + 1)); }

run remote box
expect_status 1 "remote without a command explains itself"

run setup --memory 2
expect_status 1 "setup refuses a 2 GB VM"
expect "$work/out" "--memory 2 is too little" "the memory problem is named"

run setup --cpus 4096
expect "$work/out" "--cpus 4096 is more than" "more CPUs than the machine has are refused"

run setup --disk 5
expect "$work/out" "--disk 5 is too small" "a disk smaller than setup needs is refused"

run setup --memory lots
expect "$work/out" "--memory takes a whole number" "a non-number is refused"

run setup --runtime docker
expect "$work/home/settings.env" "OFFEE_RUNTIME=docker" "the runtime is remembered"
expect "$work/out" "Docker engine does not answer" "a Docker engine that is down is caught"

run setup --runtime podman
expect "$work/out" "--runtime takes colima or docker" "an unknown runtime is refused"

[ "$failures" -eq 0 ] || { echo "$failures check(s) failed"; exit 1; }
echo "All launcher checks passed"
