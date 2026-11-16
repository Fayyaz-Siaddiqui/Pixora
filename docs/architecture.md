# Architecture

## Components

```
Browser ──▶ apps/web (Next.js) ──REST/SSE──▶ apps/api (Express)
                                               │   ├─ PostgreSQL (data + pg-boss job queue)
                                               │   └─ Storage adapter (local disk | S3 / R2 / MinIO)
                                               ▼
                                       worker process (same codebase, sharp/libvips)
                                               │  internal HTTP + service key (AI jobs only)
                                               ▼
                                       apps/ai-service (Python, FastAPI, ONNX Runtime, Real-ESRGAN)
```

## Key decisions

| Topic | Decision | Reason |
|---|---|---|
| API | Standalone Express instead of Next.js API routes | Deploys independently, streams uploads and downloads, keeps heavy work off the web server |
| Queue | pg-boss (stored in Postgres) | No Redis needed; Redis has no native Windows build. The queue sits behind an interface so it can be swapped later. |
| Editing | Non-destructive edit list, always rendered from the original upload | No repeated resampling, a single encode, cheap undo/redo |
| Preview | Instant WebGL approximation while dragging a control, then an exact sharp render of a reduced-size copy | Smooth controls, and the export matches what the user saw |
| Auth | Database sessions in an httpOnly cookie; Argon2id password hashing | Sessions can be revoked; no tokens in browser storage |
| AI | Real-ESRGAN x2/x4 (BSD-3) on ONNX Runtime: CPU, CUDA or DirectML | Real inference that works without a GPU (slowly) |
| 8x upscaling | Two AI passes, disabled by default | No official general-purpose 8x model exists |
| Face restoration | Deferred | GFPGAN depends on non-commercial NVIDIA components; CodeFormer is non-commercial. Needs a license review first. |
| Guests | Allowed with tight limits, tracked by a signed guest cookie | Files can be moved to an account at sign-up |

## Image quality rules (enforced from Phase 2)

1. The original upload is kept until processing is complete and is never overwritten.
2. Output is always rendered from the original, never from a previous output.
3. One decode and one encode per export.
4. EXIF orientation is applied before any geometry operation.
5. Alpha is preserved. Flattening into JPEG requires an explicit background colour (`checkConversion`).
6. Lanczos3 is the default resampling kernel. Enlargement is labelled as interpolation, never as recovered detail.
7. Input pixel limits (protection against decompression bombs) are checked from the image header before decoding.
8. Output dimensions are validated with `planResize` limits.

## Database

See `packages/db/prisma/schema.prisma`. Image bytes are never stored in
Postgres, only metadata and `StorageObject` keys. Storage keys and file paths
are never returned by the API.
