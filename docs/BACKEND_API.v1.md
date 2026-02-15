# BACKEND_API.v1

## Base URL

- `http://localhost:8787`

## Environment

`.env` 기준:

```env
PORT=8787
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=wheretotravel-dev
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BASE_URL=
```

## Storage

- 세션 파일: `data/runtime/sessions/{session_id}.json`
- 이벤트 로그: `data/runtime/events.jsonl`

## Endpoints

1. Health
- `GET /api/health`

2. Bootstrap metadata
- `GET /api/bootstrap`
  - `?source=local|r2` (기본값 local)

3. Country summary
- `GET /api/countries`

4. Create session
- `POST /api/sessions`
- body: `{}`

5. Get session status
- `GET /api/sessions/{session_id}`

6. Submit vote
- `POST /api/sessions/{session_id}/vote`
- body:
```json
{
  "place_id": "jp-tokyo-old-town-quarter-1",
  "choice": "like"
}
```

7. Get recommendation
- `POST /api/sessions/{session_id}/recommendation`

8. Build OTA links
- `POST /api/sessions/{session_id}/ota-links`
- body:
```json
{
  "city": "Tokyo",
  "country": "Japan",
  "travelers": 2,
  "month": "2026-03",
  "budget": "mid"
}
```

## Notes

- vote는 현재 cursor의 place_id와 정확히 일치해야 한다.
- Stage1 종료 시 Stage2 pool(26~30)이 자동 생성된다.
- Stage2 종료 시 session stage는 `completed`가 된다.

## R2 Endpoints

1. R2 status
- `GET /api/r2/status`

2. Seed data sync (local -> R2)
- `POST /api/r2/sync-seed-data`
- 업로드 대상:
  - `data/v1/tag_taxonomy.v1.json`
  - `data/v1/countries.v1.json`

3. List objects
- `GET /api/r2/list?prefix=data/v1/&limit=100`

4. Upload JSON object
- `POST /api/r2/upload-json`
- body:
```json
{
  "key": "data/v1/custom.json",
  "value": {
    "ok": true
  }
}
```

5. Upload base64 object
- `POST /api/r2/upload-base64`

6. Upload image from URL
- `POST /api/r2/upload-image-url`
- body:
```json
{
  "key": "images/sample.jpg",
  "source_url": "https://images.example.com/sample.jpg"
}
```

7. Signed URL (GET)
- `GET /api/r2/signed-url?key=images/sample.jpg&expires=3600`

8. Public URL helper
- `GET /api/r2/public-url?key=images/sample.jpg`

9. Object preview (text)
- `GET /api/r2/object?key=data/v1/custom.json`
