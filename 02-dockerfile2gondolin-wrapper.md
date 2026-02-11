# 02 — `dockerfile2gondolin` Wrapper

## Objective
Provide a convenience CLI that takes a Dockerfile context and produces Gondolin output by delegating to:

1. BuildKit (Dockerfile -> OCI)
2. `oci2gondolin` (OCI -> Gondolin)

## Why wrapper only
Avoid reimplementing Dockerfile semantics. BuildKit already supports modern Dockerfile behavior and caching.

## Supported backends (priority)
1. `docker buildx build`
2. standalone `buildctl`

## CLI (proposed)
```bash
dockerfile2gondolin \
  --file ./Dockerfile \
  --context . \
  --platform linux/arm64 \
  --out ./out/app-assets \
  --mode assets
```

Optional:
- `--builder docker-buildx|buildctl`
- `--target <stage>`
- `--build-arg KEY=VALUE` (repeatable)
- `--secret id=...,src=...` (pass-through)

## Internal flow
1. Validate builder availability
2. Build Dockerfile into temp OCI tar/layout
3. Invoke `oci2gondolin` with resulting OCI artifact
4. Copy final output to requested destination
5. Emit concise build summary

## Error mapping
Map common failures to clear messages:
- builder missing
- build step failed
- OCI output missing/invalid
- conversion failed

## Deliverable quality bar
- deterministic output for same Dockerfile + pinned base digests
- clear logs separating build phase and conversion phase
- no Gondolin code changes required
