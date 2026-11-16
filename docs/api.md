# Image API reference

Base URL in development: `http://localhost:4000`.

## How it works

1. **Upload.** `POST /api/images/upload` returns image ids.
2. **Start a job.** Call a tool endpoint (e.g. `POST /api/images/resize`). It
   returns `202` and a `job` object straight away. Processing happens in the
   background queue.
3. **Poll the job.** Call `GET /api/jobs/:id` until `status` is `SUCCEEDED` or
   `FAILED`. `progress` goes from 0 to 100.
4. **Download the result.** Use `job.result.asset.urls.download`.

Every job renders from the **original upload** and encodes the output once,
so quality never degrades across repeated edits.

## Identity and security

- **Guest identity.** Visitors are identified by a signed, httpOnly cookie
  (`gid`). Browsers must send it, so use `fetch(url, { credentials: 'include' })`.
- **Private files.** Images are visible only to the visitor who uploaded them.
  Anyone else gets `404`.
- **CSRF protection.** State-changing requests from an origin that isn't in
  `WEB_ORIGIN` are rejected with `403`.
- **Automatic expiry.** Files are deleted after `FILE_RETENTION_HOURS`, after
  which requests for them return `410`.

## Upload

```http
POST /api/images/upload
Content-Type: multipart/form-data   (one or more parts named "files")
```

Response `201` (at least one file accepted) or `422` (all rejected):

```json
{
  "uploaded": [{ "id": "…", "name": "photo.jpg", "format": "jpeg", "width": 4000, "height": 3000,
                 "hasAlpha": false, "sizeBytes": 2483112, "extensionMismatch": false, "pages": 1,
                 "urls": { "file": "/api/images/…/file", "download": "/api/images/…/file?download=1", "thumbnail": "/api/images/…/thumbnail" } }],
  "rejected": [{ "name": "broken.jpg", "code": "CORRUPT_IMAGE", "message": "The image file appears to be damaged or incomplete." }]
}
```

How uploads are validated:

- **Real format.** The format is detected from the file's content (magic
  bytes), not its extension.
- **Size and pixel limits.** Size is limited while streaming. Pixel count is
  checked from the image header before decoding, which protects against
  decompression bombs.
- **Full decode.** Every file is fully decoded once to catch damaged data.
- **Dimensions.** `width` and `height` are the displayed size, with EXIF
  orientation applied.

## Tool endpoints

Body shape: `{ "assetId": "…", "options": { … }, "output": { … } }`.
`output` is optional; without it the source format is kept.

| Endpoint | `options` |
|---|---|
| `/api/images/resize` | `width`, `height`, `percent`, `fit` (`inside` · `contain` · `cover` · `stretch`), `kernel` (`lanczos3` · `mitchell` · `cubic` · `nearest`), `background` (#hex, for `contain`), `position` (for `cover`: `centre`, `attention`, …) |
| `/api/images/crop` | `left`, `top`, `width`, `height`, `circle` (true = circular crop) |
| `/api/images/rotate` | `angle` (any angle; non-right angles expand the canvas), `background` |
| `/api/images/flip` | `horizontal`, `vertical` |
| `/api/images/enhance` | `brightness`, `contrast`, `saturation`, `temperature`, `tint`, `highlights`, `shadows` (−100…100), `exposure` (EV −5…5), `gamma` (0.2…5), `sharpen` `{sigma, amount}`, `denoise` `{size: 3/5/7}` |
| `/api/images/sharpen` | `sigma`, `amount` |
| `/api/images/blur` | `sigma` |
| `/api/images/background` | `color` (replaces transparency) |
| `/api/images/compress` | none: use `output` |
| `/api/images/convert` | none: use `output.format` |

### `output`

| Field | Meaning |
|---|---|
| `format` | `jpeg` · `png` · `webp` · `avif` |
| `preset` | `best` · `balanced` (default) · `smallest` · `custom` |
| `quality` | 1–100, used by `custom` |
| `lossless` | WebP and AVIF only |
| `targetSizeKB` | Best-effort maximum size (JPEG, WebP or AVIF). The result reports `details.targetMet`. Quality never drops below a floor (30 for JPEG and WebP, 20 for AVIF), so an unreachable target returns the smallest acceptable file with `targetMet: false`. |
| `background` | Flattens transparency onto this colour. **Required** when converting a transparent image to JPEG; transparency is never removed silently. |
| `keepMetadata` | Keeps camera, author and date EXIF fields. GPS location is always removed. By default all metadata is stripped. |

Example:

```bash
curl -b cookies -c cookies -H "Origin: http://localhost:3000" -H "Content-Type: application/json" \
  -d '{"assetId":"<id>","options":{"width":1080,"height":1080,"fit":"cover"},"output":{"format":"webp"}}' \
  http://localhost:4000/api/images/resize
```

## Editor pipeline

`POST /api/images/process` takes
`{ assetId, operations: [...], output }`. Operations run **in the order
given**. Each one is an object with a `type` (`resize`, `crop`, `circle`,
`rotate`, `flip`, `adjust`, `sharpen`, `denoise`, `blur` or `background`) and
the same fields as the tool options above. There can be at most 20 operations.

## Batch

`POST /api/images/batch` takes `{ assetIds: [...], operations: [...], output }`
and returns a `batch`.

- Poll `GET /api/batches/:id`.
- Download every result as one streamed ZIP from
  `GET /api/batches/:id/download`.
- An image that doesn't suit the settings fails on its own, and the batch
  status becomes `PARTIAL`.
- Failed jobs can be retried with `POST /api/jobs/:id/retry`.

## Job object

```json
{
  "id": "…", "type": "RESIZE", "status": "SUCCEEDED", "progress": 100,
  "error": null,
  "result": {
    "asset": { "id": "…", "name": "photo-1080x1080.webp", "urls": { "download": "…" } },
    "width": 1080, "height": 1080, "format": "webp",
    "sizeBytes": 84211, "originalSizeBytes": 2483112, "savedPercent": 96.6, "durationMs": 412,
    "details": { "preset": "balanced", "quality": 80, "targetMet": null, "flattenedTransparency": false, "metadataKept": false }
  }
}
```

## Error codes

| Code | Meaning |
|---|---|
| `VALIDATION_FAILED` | The request body or options are invalid |
| `INVALID_DIMENSIONS` | The requested size or crop isn't possible |
| `UNSUPPORTED_FORMAT` | The file isn't one of the supported image formats |
| `CORRUPT_IMAGE` | The file is damaged or incomplete |
| `IMAGE_TOO_LARGE` | The image has more pixels than the limit |
| `PAYLOAD_TOO_LARGE` | The file is bigger than the upload size limit |
| `QUOTA_EXCEEDED` | The daily processing limit has been reached |
| `RATE_LIMITED` | Too many requests in a short time |
| `PROCESSING_TIMEOUT` | Processing took longer than the allowed time |
| `PROCESSING_FAILED` | Processing failed for another reason |
| `STORAGE_ERROR` | The file could not be read from or written to storage |
| `NOT_FOUND` | The image, job or batch doesn't exist, isn't yours, or has expired |
| `FORBIDDEN` | The request came from an origin that isn't allowed |
