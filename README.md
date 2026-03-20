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
- 📚 **Google Classroom Integration** — Post assignments, sync grades automatically

## Google Classroom Integration

MathMind now integrates with Google Classroom for seamless assignment management:

- **Post quizzes as assignments** - Create quizzes and automatically post to Classroom
- **Student validation** - Only enrolled students can access class quizzes
- **Automatic grade sync** - Scores are pushed to Classroom gradebook
- **Course & topic selection** - Organize assignments by course and topic

See [GOOGLE_CLASSROOM_SETUP.md](GOOGLE_CLASSROOM_SETUP.md) for setup instructions.

## Question Types

- Multiple Choice (A/B/C/D)
- True / False
- Matching (drag & drop)
- Open Ended (with AI sample answer)

## Setup

### Prerequisites
- Python 3.8+
- Node.js 18+ (for frontend only)
- (Optional) OpenRouter API key or local Ollama instance

### Install & Run

```bash
# Install Python dependencies
pip install -r server-python/requirements.txt

# Install frontend dependencies
npm install --prefix client

# Start the Python backend server
python server-python/server.py

# In another terminal, start the frontend
npm run dev --prefix client
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000

### AI Configuration

Click the ⚙️ gear icon on the home screen to configure your AI provider:

**OpenRouter Free Tier** (recommended):
1. Get a free API key at https://openrouter.ai/keys
2. Create `client/.env` file with: `VITE_OPENROUTER_API_KEY=your_key_here`
3. Default model: `meta-llama/llama-3-8b-instruct:free`
4. Browse more free models: https://openrouter.ai/models?max_price=0

Note: Free tier models have rate limits. For unlimited access, add credits to your OpenRouter account.

### Demo Mode

On the Student Join screen, click **"Try demo quiz"** to test without a real AI key — loads a pre-built fractions quiz.

## File Structure

```
mathmind/
├── server-python/       # Python + Flask + SQLite
│   ├── server.py
│   ├── db.py
│   ├── routes/
│   │   ├── quiz.py
│   │   ├── attempt.py
│   │   ├── violations.py
│   │   └── dashboard.py
│   └── services/
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
1. Run the Python server on a dedicated machine
2. Set `VITE_API_URL=http://<server-ip>:5000` in `client/.env`
3. Rebuild the frontend: `npm run build --prefix client`
4. Serve `client/dist/` with any static server
