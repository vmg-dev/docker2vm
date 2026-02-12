#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/out/e2e-busybox-assets}"
IMAGE="${IMAGE:-busybox:latest}"

if [[ -n "${PLATFORM:-}" ]]; then
  TARGET_PLATFORM="${PLATFORM}"
else
  case "$(uname -m)" in
    x86_64|amd64)
      TARGET_PLATFORM="linux/amd64"
      ;;
    arm64|aarch64)
      TARGET_PLATFORM="linux/arm64"
      ;;
    *)
      echo "Unsupported host architecture: $(uname -m)"
      echo "Set PLATFORM explicitly (linux/amd64 or linux/arm64)."
      exit 1
      ;;
  esac
fi

rm -rf "${OUT_DIR}"

cd "${ROOT_DIR}"

bun run oci2gondolin -- \
  --image "${IMAGE}" \
  --platform "${TARGET_PLATFORM}" \
  --mode assets \
  --out "${OUT_DIR}"

GONDOLIN_SMOKE_ACCEL="${GONDOLIN_SMOKE_ACCEL:-}"
GONDOLIN_SMOKE_CPU="${GONDOLIN_SMOKE_CPU:-}"

if [[ "$(uname -s)" == "Linux" ]] && [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
  # qemu + tcg on CI does not support -cpu host; force a tcg-compatible model.
  GONDOLIN_SMOKE_ACCEL="tcg"
  GONDOLIN_SMOKE_CPU="max"
fi

GONDOLIN_GUEST_DIR="${OUT_DIR}" \
GONDOLIN_SMOKE_ACCEL="${GONDOLIN_SMOKE_ACCEL}" \
GONDOLIN_SMOKE_CPU="${GONDOLIN_SMOKE_CPU}" \
  bun ./scripts/gondolin-smoke-exec.ts /bin/busybox echo e2e-smoke-ok

echo "E2E smoke test passed (image=${IMAGE}, platform=${TARGET_PLATFORM})."
