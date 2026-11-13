#!/usr/bin/env bash
# Monorepo Architecture Guard — mechanical checks.
#
# Verifies the machine-decidable subset of the skill contract so a review does
# not rely on prompt reading alone. Prints one `check ... status=ok|violation`
# line per rule and a final `arch-check status=ok|violation violations=N` line.
# Exit code: 0 when clean, 1 when any violation, 2 on a setup error.
#
# The prose-only rules (helper-decomposition taste, class-as-namespace, "domain
# logic lives in the paired package") still need human judgment; this script
# covers only what greps and file structure can prove.
#
# Usage:
#   bash .codex/skills/monorepo-architecture-guard/scripts/check-architecture.sh [repo-root]
#
# Foreign-runtime apps (Python, native, etc.) carry no root package.json and are
# not JS/TS workspace members, so they are auto-exempted from the *_domain
# pairing rule with no project-specific configuration.
#
# Optional env:
#   ARCH_RUNTIME_ONLY_APPS  extra space-separated app names to exempt from the
#                           pairing rule beyond the package.json auto-detection.
#                           Default: empty.

set -euo pipefail

# Resolve the repository root from this script's own location, so the checker is
# correct wherever this skill was copied and whatever the caller's working
# directory is. An explicit argument still wins.
resolve_root() {
  if [[ -n "${1:-}" ]]; then
    ( cd "$1" && pwd -P )
    return
  fi
  local dir
  dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd -P )"
  while [[ "$dir" != "/" && -n "$dir" ]]; do
    if [[ -f "$dir/package.json" && -d "$dir/.codex" ]]; then
      printf '%s\n' "$dir"
      return
    fi
    dir="$( dirname "$dir" )"
  done
  pwd -P
}

root="$( resolve_root "${1:-}" )"
cd "$root" || exit 2

runtime_only_apps=" ${ARCH_RUNTIME_ONLY_APPS:-} "
violations=0

emit() {
  # emit <name> <ok|violation> <detail...>
  local name="$1" status="$2"
  shift 2
  echo "check name=$name status=$status ${*:-}"
  [[ "$status" == "violation" ]] && violations=$((violations + 1)) || true
}

is_runtime_only() {
  local needle="$1"
  [[ "$runtime_only_apps" == *" $needle "* ]]
}

# 1. root package.json declares npm workspaces
if [[ -f package.json ]] && grep -Eq '"workspaces"[[:space:]]*:' package.json; then
  emit workspaces ok
else
  emit workspaces violation detail=root-package.json-declares-no-workspaces
fi

# 2. one package manager. A second lockfile means two answers to the same
#    question about what is installed.
stray_pm=""
for f in yarn.lock .yarnrc.yml pnpm-lock.yaml pnpm-workspace.yaml; do
  [[ -e "$f" ]] && stray_pm="$stray_pm $f"
done
if [[ -z "$stray_pm" ]]; then
  emit no-foreign-lockfiles ok
else
  emit no-foreign-lockfiles violation detail="present:${stray_pm# }"
fi

# 3. package-lock.json committed. It is what makes `npm ci` reproducible; the
#    scaffold has none until the first install, so this is a warn there.
if [[ -f package-lock.json ]]; then
  emit lockfile-present ok
elif [[ -d node_modules ]]; then
  emit lockfile-present violation detail=installed-without-package-lock.json
else
  emit lockfile-present warn detail=not-installed-yet
fi

# 5. packages/* must never import from apps/*  (reverse dependency)
reverse_hits=""
if [[ -d packages ]]; then
  reverse_hits="$(grep -REn \
    --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' \
    "(from[[:space:]]+['\"]|require\(['\"]|import\(['\"])(apps/|\.\./\.\./apps/)" \
    packages 2>/dev/null || true)"
fi
if [[ -z "$reverse_hits" ]]; then
  emit no-package-imports-app ok
else
  emit no-package-imports-app violation detail=packages-import-apps
  printf '%s\n' "$reverse_hits" | sed 's/^/  reverse-import: /'
fi

# 6. each apps/<svc> pairs with packages/<svc>_domain (runtime-only apps exempt)
if [[ -d apps ]]; then
  for app_dir in apps/*/; do
    [[ -d "$app_dir" ]] || continue
    app="$(basename "$app_dir")"
    # Foreign-runtime app (no package.json => not a JS/TS workspace member).
    if [[ ! -f "$app_dir/package.json" ]]; then
      emit "pair:$app" ok detail=foreign-runtime-exempt
      continue
    fi
    if is_runtime_only "$app"; then
      emit "pair:$app" ok detail=runtime-only-exempt
      continue
    fi
    if [[ -d "packages/${app}_domain" ]]; then
      emit "pair:$app" ok
    else
      emit "pair:$app" violation detail="missing-packages/${app}_domain"
    fi
  done
fi

# 7. non-exact versions in dependencies/devDependencies of any workspace manifest
#    (peerDependencies are allowed ranges and are skipped).
#
#    A dependency on another package in this repository is exempt: it resolves
#    to a symlink, so the range never selects anything and pinning it only
#    creates a second place to edit on every version bump.
local_packages="$(find apps packages -maxdepth 2 -name package.json \
  -not -path '*/node_modules/*' -type f 2>/dev/null \
  | while IFS= read -r m; do node -p "require('./${m#./}').name" 2>/dev/null; done \
  | paste -sd ',' -)"

range_hits=""
while IFS= read -r manifest; do
  block="$(node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const local = new Set((process.argv[2] || "").split(",").filter(Boolean));
    const out = [];
    for (const field of ["dependencies", "devDependencies"]) {
      const deps = m[field] || {};
      for (const [name, spec] of Object.entries(deps)) {
        if (typeof spec !== "string") continue;
        if (local.has(name)) continue;
        if (/^(workspace:|file:|link:|portal:|patch:|npm:.*@)/.test(spec)) continue;
        if (/[\^~]|\s-\s|\|\||\bx\b|\.\*/.test(spec) || spec === "*" || spec === "latest") {
          out.push(`${field}:${name}@${spec}`);
        }
      }
    }
    if (out.length) console.log(process.argv[1] + " => " + out.join(", "));
  ' "$manifest" "$local_packages" 2>/dev/null || true)"
  [[ -n "$block" ]] && range_hits="$range_hits$block"$'\n'
done < <(find . -name package.json \
  -not -path '*/node_modules/*' -not -path '*/dist/*' \
  -type f 2>/dev/null | sort)
if [[ -z "$range_hits" ]]; then
  emit exact-versions ok
else
  emit exact-versions violation detail=non-exact-version-ranges
  printf '%s' "$range_hits" | sed 's/^/  range: /'
fi

# 8. Folder granularity. Containment against model-driven edits comes from
#    folder boundaries, so a folder holding many files is the signal that the
#    split tracked size instead of rate of change. Judgment call, so `warn`.
crowded_limit="${ARCH_FOLDER_FILE_LIMIT:-8}"
crowded=""
while IFS= read -r dir; do
  count="$(find "$dir" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | wc -l)"
  [[ "$count" -gt "$crowded_limit" ]] && crowded="$crowded  crowded-folder: ${dir#./} ($count files)"$'\n'
done < <(find apps packages -type d -path '*/src/*' \
  -not -path '*/node_modules/*' -not -path '*/dist/*' 2>/dev/null | sort)

if [[ -z "$crowded" ]]; then
  emit folder-granularity ok
else
  emit folder-granularity warn detail="folders above $crowded_limit source files"
  printf '%s' "$crowded"
fi

echo "arch-check status=$([[ $violations -eq 0 ]] && echo ok || echo violation) violations=$violations root=$root"
[[ $violations -eq 0 ]]
