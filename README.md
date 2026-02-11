# Gondolin Image Tooling Plan

## Goal
Create external tooling that converts container artifacts into images Gondolin can boot **without modifying Gondolin core code**.

## Recommendation
Build in this order:

1. **`oci2gondolin` first** (core converter)
2. **`dockerfile2gondolin` second** (thin wrapper around BuildKit + `oci2gondolin`)

This keeps complexity low and allows multiple input paths (registry, CI-produced OCI tar, local OCI layout).

## Why OCI-first
- Dockerfile support is effectively a full build system
- OCI image/manifest/layers are a stable output contract
- Reusable converter for any upstream build stack

## Deliverables
- `oci2gondolin` CLI
- `dockerfile2gondolin` CLI (wrapper)
- Test fixtures + conformance tests
- Basic docs and examples

## Directory contents
- [`01-oci2gondolin-spec.md`](./01-oci2gondolin-spec.md)
- [`02-dockerfile2gondolin-wrapper.md`](./02-dockerfile2gondolin-wrapper.md)
- [`03-implementation-phases.md`](./03-implementation-phases.md)
- [`04-testing-and-release.md`](./04-testing-and-release.md)
- [`05-open-questions.md`](./05-open-questions.md)
