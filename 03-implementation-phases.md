# 03 — Implementation Phases

## Timeline (single engineer estimate)
- MVP: **2–4 weeks**
- Hardened v1: **6–10 weeks**

## Phase breakdown

## Phase 0 — Spike (2–3 days)
- Validate rootfs-only loading path with current Gondolin (`rootDiskPath`)
- Confirm minimum runtime files/processes needed for `vm.exec`
- Capture one known-good manual conversion recipe

**Exit criteria:** end-to-end manual demo from OCI image to running VM

## Phase 1 — `oci2gondolin` scaffolding (2–3 days)
- CLI parser + config model
- source abstraction (`image ref`, `oci tar`, `oci layout`)
- output modes (`rootfs`, `assets`)

**Exit criteria:** CLI skeleton + dry-run mode

## Phase 2 — OCI resolver/puller (4–6 days)
- auth token flow
- manifest/index selection by platform
- blob download/read + digest verification
- local blob cache by digest

**Exit criteria:** pull and verify layers/config for public images

## Phase 3 — Layer apply engine (4–7 days)
- ordered extraction
- whiteout/opaque directory handling
- secure extraction checks

**Exit criteria:** merged rootfs matches expected filesystem semantics

## Phase 4 — Gondolin materialization (3–5 days)
- inject runtime requirements
- ext4 build step
- emit `meta.json` and/or full assets bundle

**Exit criteria:** converted image boots and supports `vm.exec`

## Phase 5 — `dockerfile2gondolin` wrapper (3–5 days)
- BuildKit integration (`buildx`, `buildctl`)
- argument passthrough for target/build args/secrets
- temporary OCI artifact handling

**Exit criteria:** Dockerfile -> Gondolin in one command

## Phase 6 — Hardening + docs (4–7 days)
- integration tests with multiple fixtures
- performance/caching tuning
- user docs + troubleshooting

**Exit criteria:** v1 candidate release

## Suggested sequencing notes
- Keep converter core independent from CLI wrappers
- Keep all Dockerfile logic in wrapper layer
- Ensure all artifacts are reproducible and cache-addressable by digest
