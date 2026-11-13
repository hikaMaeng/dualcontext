#!/usr/bin/env bash
# 사용법: launch.sh <세션이름> <작업디렉터리(Git Bash 경로)> <공통지시문> <세션지시문>
# 서브 세션 = `codex exec` 한 번(gpt-6.1-terra / reasoning medium / workspace-write + 네트워크).
# 쓰기는 작업 디렉터리 안에서만 가능하다(샌드박스). 결과는 results/<세션이름>/ 에 남는다.
set -u
NAME="$1"; CWD="$2"; COMMON="$3"; BRIEF="$4"
N="/c/Users/hika0/AppData/Roaming/Claude-2/side-session-notes/local_75901231-cd58-40c3-96f2-906fa1b15187"
OUT="$N/results/$NAME"
mkdir -p "$OUT"
cat "$N/prompts/$COMMON" "$N/prompts/$BRIEF" | sed "s/{SID}/$NAME/g" > "$OUT/prompt.md"
date -Iseconds > "$OUT/started.txt"
codex exec -m gpt-6.1-terra -c model_reasoning_effort=medium \
  -c 'windows.sandbox="unelevated"' -s workspace-write -c sandbox_workspace_write.network_access=true \
  -C "$CWD" --skip-git-repo-check --json -o "$OUT/final.md" - < "$OUT/prompt.md" > "$OUT/events.jsonl" 2> "$OUT/stderr.log"
echo "exit=$?" > "$OUT/exit.txt"
date -Iseconds > "$OUT/finished.txt"
