# Classroom grade sync fails (Google Classroom)

Date: 2026-03-13  
Status: Open

## Summary
- Grade syncs to Google Classroom are failing because the code patches `studentSubmissions` using a roster `userId` instead of the required submission id.
- Queue entries stay `pending` and keep retrying (up to 3 attempts) with no grades delivered to Classroom.

## Impact
- Teachers never see MathMind scores in Google Classroom.
- `grade_sync_queue` accumulates stale rows; retries stop at 3 but status remains `pending`, masking the real failure.

## Evidence
- Database snapshot (2026-03-13 02:32) shows four pending rows in `grade_sync_queue`:
  - course_id `616910379937`, coursework_id `851335179548`, student_email `regisgambiza@gmail.com`, retry_count 1–3, status `pending`.
- Code reference: `server-python/services/classroom.py:386-418` calls `studentSubmissions().patch` with `id=student_user_id` (roster userId) instead of a `studentSubmission.id`.
- Queue logic: `process_grade_sync_queue` resolves `student_user_id` from the roster, then calls `sync_grade`; the Classroom API returns 404, retry_count increments, and the row stays `pending`.

## Reproduction
1. Use teacher id `98` (connected to Classroom) and a quiz posted to course `616910379937` with coursework `851335179548`.
2. Finish the quiz as an enrolled student (e.g., `regisgambiza@gmail.com`).
3. Backend enqueues a row in `grade_sync_queue`.
4. `process_grade_sync_queue()` runs (during attempt completion) and invokes `sync_grade`.
5. Google Classroom responds with “Requested entity was not found” because the PATCH `id` is a userId, not the submission id; queue row is retried until `retry_count` reaches 3 and remains `pending`.

## Root cause
- Misused identifier: `sync_grade` uses roster `userId` as the `studentSubmissions().patch` target; the API expects the submission id returned by `studentSubmissions().list`/`get`.
- Secondary reliability issue: `get_teacher_credentials` does not set `expiry` on the Credentials object, so `credentials.expired` never triggers refresh. After the stored expiry (2026-03-12T20:29:23 for teacher 98), all Classroom calls will 401 even if the identifier bug is fixed.

## Proposed fix
- In `sync_grade`:
  - Fetch the student submission id via `studentSubmissions().list(courseId, courseworkId, userId=student_user_id)` (or list then filter by `userId`), then PATCH using that submission id.
  - Send both `draftGrade` and `assignedGrade`, and consider setting `state='RETURNED'` so the grade posts to the gradebook.
- In credential handling:
  - Populate `Credentials(..., expiry=expires_dt)` so `.expired` works; refresh tokens when expired and persist the new access token plus expiry.
- Queue hygiene:
  - Persist the actual error message; mark rows `failed` after the final retry so monitoring shows the failure instead of silent `pending` items.
  - Add basic success/failure logging or metrics.

## Workaround
- Manually enter grades in Google Classroom until the patch is applied; the automated sync will not succeed in its current state.
