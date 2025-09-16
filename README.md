# Monodin

Monodin is a local-first journaling app that turns handwritten entries into structured insights. Upload scanned pages of your journal and Monodin will run OCR, extract sentiment, emotions, tasks, and goals, then visualise everything on a personal dashboard. All processing runs locally – no cloud services required.

## Architecture

| Layer      | Technology | Responsibilities |
| ---------- | ---------- | ---------------- |
| Frontend   | React (CRA) | Authentication, image upload, entry management UI, insight dashboard with charts. |
| Backend    | Node.js + Express | Authentication, file handling, orchestration of OCR/NLP pipeline, REST API. |
| Database   | PostgreSQL  | Stores users, journal entries, and derived insights. |
| Processing | Tesseract.js, Sentiment, Compromise | OCR, sentiment analysis, emotion detection, task & goal extraction. |

Uploaded images are stored on disk (simulating cloud storage). Metadata, raw text, and extracted insights are saved in Postgres. The dashboard queries aggregated data to show trends over time.

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL database

### Environment variables

Create a `.env` file inside the `backend/` folder with:

```
DATABASE_URL=postgres://user:password@localhost:5432/monodin
JWT_SECRET=replace-with-a-long-random-string
CLIENT_ORIGIN=http://localhost:3000
OCR_DEBUG=false
```

`CLIENT_ORIGIN` is optional and limits which origins can call the API. `OCR_DEBUG=true` prints Tesseract progress logs.

### Install dependencies

```
cd backend
npm install
cd ../frontend
npm install
```

### Run the stack locally

1. Start PostgreSQL and ensure the `DATABASE_URL` database exists.
2. Start the API server:
   ```
   cd backend
   npm run dev
   ```
   The server listens on `http://localhost:5000`. Database schema is created automatically on boot.
3. Start the React app in a separate terminal:
   ```
   cd frontend
   npm start
   ```
   The UI runs on `http://localhost:3000` by default and interacts with the backend via REST.

### Production builds

- Backend: `npm start` (after building, or using a process manager).
- Frontend: `npm run build` and serve the generated `/build` folder.

## API overview

All endpoints live under `/api`. Authentication uses JSON Web Tokens passed in the `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `POST` | `/auth/register` | Create a new account (name, email, password). |
| `POST` | `/auth/login` | Authenticate and retrieve a JWT. |
| `GET`  | `/auth/me` | Returns the current user (requires JWT). |
| `POST` | `/journal` | Upload an image (`multipart/form-data`) and enqueue OCR processing. |
| `GET`  | `/journal` | List journal entries with status, OCR text, and insights. |
| `GET`  | `/journal/:id` | Fetch a single entry. |
| `DELETE` | `/journal/:id` | Delete an entry and its insights. |
| `GET`  | `/dashboard/summary?range=<days>` | Aggregated insights for charts and KPIs. |

### Data model

- **users**: id, email, hashed password, name.
- **journal_entries**: id, user reference, entry date, stored image path, original filename, status (`processing`, `done`, `failed`), raw OCR text, timestamps.
- **insights**: entry reference, sentiment label/score, emotions (JSON), tasks (JSON array), goals (JSON array).

## Processing pipeline

1. **Upload** – The frontend sends an image with the intended journal date. Metadata is written to Postgres with `status="processing"` and the file is stored under `backend/uploads/`.
2. **OCR** – Tesseract.js converts handwriting into raw text. Failures mark the entry as `failed` with the error message.
3. **NLP** – Using Sentiment and Compromise:
   - Sentiment label & score (positive / neutral / negative)
   - Emotion keyword counts (joy, sadness, anger, fear, surprise, love, calm)
   - Tasks (status inferred from bullet markers or phrasing)
   - Goals (short vs long term based on time references)
4. **Persist** – Raw text and JSON insights are stored in the database. Entry status flips to `done`.
5. **Dashboard** – Aggregated queries power charts: sentiment trends, emotion distribution, task progress, goal tracking, and entry statuses.

## Security considerations

- Passwords are hashed with bcrypt.
- JWT secret must remain private; rotate periodically.
- Only authenticated requests can access journal or dashboard endpoints.
- Users can delete entries (file + data) at any time for privacy.

## Frontend experience

- Login / registration screen with local token storage.
- Image upload form with status feedback.
- Entry list showing processing state, OCR text, errors, and extracted insights.
- Dashboard cards and charts (Line, Doughnut, Bar) with range filters for 7/30/90 days.
- Automatic polling while entries are processing.

## Development tips

- To inspect uploads, check `backend/uploads/`. Files are named with UUIDs.
- Setting `OCR_DEBUG=true` in the backend `.env` prints progress while Tesseract runs.
- The pipeline runs immediately after upload; for heavy workloads you can move it to a job queue.
- The NLP heuristics are lightweight and rely on keyword matching. Extend `backend/utils/insights.js` for richer analysis.

Enjoy journaling! ✨
