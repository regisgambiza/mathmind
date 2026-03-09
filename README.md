# MathMind 🧠

**AI-powered math quiz platform for schools.** Teachers create quizzes, AI generates unique questions per student — no two students get the same quiz.

## Features

- 🎓 **Teacher role** — Create quizzes with topic, grade, question types and number of questions
- 📚 **Grade 7 curriculum** — Structured 27-chapter picker with subtopics
- 🤖 **AI generation** — Unique questions per student via OpenRouter or local Ollama
- 🔒 **Anti-cheat** — Page Visibility API tracks tab switches (3 warnings → auto-submit)
- 📊 **Live dashboard** — Teacher sees all students in real-time with scores
- 📥 **CSV export** — Download full results per quiz
- 🗃️ **SQLite backend** — Zero-config local database

## Question Types

- Multiple Choice (A/B/C/D)
- True / False
- Matching (drag & drop)
- Open Ended (with AI sample answer)

## Setup

### Prerequisites
- Node.js 18+
- (Optional) OpenRouter API key or local Ollama instance

### Install & Run

```bash
# Install all dependencies
npm run install:all

# Start both servers concurrently
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000

### AI Configuration

Click the ⚙️ gear icon on the home screen to configure your AI provider:

**OpenRouter** (recommended):
1. Get a free API key at https://openrouter.ai
2. Set provider to "OpenRouter", paste your key
3. Default model: `openai/gpt-4o-mini`

**Local Ollama**:
1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3`
3. Set provider to "Ollama", set base URL to `http://localhost:11434`

Settings are saved to `localStorage` automatically.

### Demo Mode

On the Student Join screen, click **"Try demo quiz"** to test without a real AI key — loads a pre-built fractions quiz.

## File Structure

```
mathmind/
├── server/              # Node.js + Express + SQLite
│   ├── server.js
│   ├── db.js
│   └── routes/
│       ├── quiz.js
│       ├── attempt.js
│       ├── violations.js
│       └── dashboard.js
└── client/              # React + Vite + Tailwind
    └── src/
        ├── context/     # AIContext, QuizContext
        ├── pages/       # All 7 screens
        ├── components/  # TopBar, question types, etc.
        ├── hooks/       # useApi, useVisibilityGuard
        └── data/        # Grade 7 curriculum
```

## School Deployment

For classroom use on a local network:
1. Run the Express server on a dedicated machine
2. Set `VITE_API_URL=http://<server-ip>:4000` in `client/.env`
3. Rebuild the frontend: `npm run build --prefix client`
4. Serve `client/dist/` with any static server
