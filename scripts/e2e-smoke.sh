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

GONDOLIN_BIN="${ROOT_DIR}/node_modules/@earendil-works/gondolin/dist/bin/gondolin.js"
if [[ ! -f "${GONDOLIN_BIN}" ]]; then
  echo "gondolin CLI not found at ${GONDOLIN_BIN}"
  exit 1
fi

GONDOLIN_GUEST_DIR="${OUT_DIR}" bun "${GONDOLIN_BIN}" exec -- /bin/busybox echo e2e-smoke-ok

echo "E2E smoke test passed (image=${IMAGE}, platform=${TARGET_PLATFORM})."
