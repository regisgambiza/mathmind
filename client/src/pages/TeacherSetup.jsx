import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuiz } from '../context/QuizContext';
import { G7_CURRICULUM } from '../data/curriculum';
import api from '../hooks/useApi';

const GRADES = ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const DIFFICULTY_LEVELS = [
  { id: 'foundation', label: 'Foundation', description: 'Basic concepts, straightforward questions', color: 'bg-green-500', icon: '🌱' },
  { id: 'core', label: 'Core', description: 'Grade-level standard difficulty', color: 'bg-blue-500', icon: '📚' },
  { id: 'advanced', label: 'Advanced', description: 'Challenging, complex problems', color: 'bg-purple-500', icon: '🚀' },
];
const QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Multiple Choice' },
  { id: 'multi_select', label: 'Multi Select' },
  { id: 'true_false', label: 'True / False' },
  { id: 'matching', label: 'Matching' },
  { id: 'numeric_response', label: 'Numeric Response' },
  { id: 'ordering', label: 'Ordering' },
  { id: 'fill_blank', label: 'Fill in the Blank' },
  { id: 'error_analysis', label: 'Error Analysis' },
  { id: 'open_ended', label: 'Open Ended' },
];
const ACTIVITY_TYPES = [
  {
    id: 'class_activity',
    title: 'Class Activity',
    description: 'Use for lesson-by-lesson practice during class.',
  },
  {
    id: 'topic_quiz',
    title: 'Topic Quiz',
    description: 'Use as the end-of-topic summative quiz.',
  },
];

function genCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export default function TeacherSetup() {
  const navigate = useNavigate();
  const { setQuizConfig, setQuizCode } = useQuiz();

  const [activityType, setActivityType] = useState('class_activity');
  const [grade, setGrade] = useState('Grade 7');
  const [chapter, setChapter] = useState('');
  const [subtopics, setSubtopics] = useState([]);
  const [freeText, setFreeText] = useState('');
  const [topicMode, setTopicMode] = useState('curriculum'); // 'curriculum' or 'custom'
  const [difficulty, setDifficulty] = useState('core'); // 'foundation', 'core', 'advanced'
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState(['multiple_choice', 'true_false', 'numeric_response']); // Default types
  const [typeWeights, setTypeWeights] = useState({
    multiple_choice: 34,
    true_false: 33,
    numeric_response: 33
  }); // Auto-distributed to 100%
  const [timeLimit, setTimeLimit] = useState(0);
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isG7 = grade === 'Grade 7';
  const selectedChapter = useMemo(() => G7_CURRICULUM.find((c) => c.ch === chapter), [chapter]);
  const topic = topicMode === 'curriculum'
    ? (chapter && subtopics.length > 0 ? `${chapter} -> ${subtopics.join(', ')}` : '')
    : freeText.trim();
  const canSubmit = topic && types.length > 0;

  const toggleType = (id) => {
    setTypes((prev) => {
      const newTypes = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      
      // Auto-distribute weights evenly when types change
      if (newTypes.length > 0) {
        const equalWeight = Math.round(100 / newTypes.length);
        const newWeights = {};
        newTypes.forEach((type, idx) => {
          // Last type gets remainder to ensure exactly 100%
          if (idx === newTypes.length - 1) {
            newWeights[type] = 100 - (equalWeight * (newTypes.length - 1));
          } else {
            newWeights[type] = equalWeight;
          }
        });
        setTypeWeights(newWeights);
      }
      
      return newTypes;
    });
  };

  const updateTypeWeight = (id, value) => {
    setTypeWeights((prev) => ({ ...prev, [id]: Number(value) }));
  };

  const toggleSubtopic = (value) => {
    setSubtopics((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    const code = genCode();

    try {
      await api.post('/api/quiz', {
        code,
        topic,
        chapter: topicMode === 'curriculum' && isG7 ? chapter : null,
        subtopic: topicMode === 'curriculum' && isG7 ? JSON.stringify(subtopics) : null,
        activity_type: activityType,
        grade,
        difficulty,
        question_types: types,
        type_weights: Object.keys(typeWeights).length > 0 ? typeWeights : null,
        q_count: count,
        time_limit_mins: timeLimit,
        extra_instructions: extra || null,
      });

      setQuizConfig({
        topic,
        grade,
        count,
        types,
        extra,
        timeLimit,
        difficulty,
        activity_type: activityType,
      });
      setQuizCode(code);
      navigate('/teacher/dashboard');
    } catch {
      setError('Could not create activity. Please check server connectivity.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 animate-fadeUp">
      <header>
        <h1 className="font-syne font-800 text-3xl text-ink">✨ Create Learning Activity</h1>
        <p className="font-dm text-muted mt-1">Set up either a class activity or a topic quiz.</p>
      </header>

      <section>
        <label className="font-syne font-600 text-sm text-ink block mb-2">Activity Type</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ACTIVITY_TYPES.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivityType(item.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${activityType === item.id
                ? 'border-accent2 bg-accent2/5'
                : 'border-border bg-card hover:border-border/80'
                }`}
            >
              <p className="font-syne font-700 text-sm text-ink">{item.title}</p>
              <p className="font-dm text-xs text-muted mt-1">{item.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="font-syne font-600 text-sm text-ink block mb-2">Grade</label>
        <select
          value={grade}
          onChange={(e) => { setGrade(e.target.value); setChapter(''); setSubtopics([]); }}
          className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
        >
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <label className="font-syne font-600 text-sm text-ink">Topic</label>
          <div className="flex gap-1 bg-paper border border-border rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setTopicMode('curriculum')}
              className={`px-3 py-1 rounded-md text-xs font-syne font-700 transition-all ${
                topicMode === 'curriculum'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              📚 Curriculum
            </button>
            <button
              type="button"
              onClick={() => setTopicMode('custom')}
              className={`px-3 py-1 rounded-md text-xs font-syne font-700 transition-all ${
                topicMode === 'custom'
                  ? 'bg-accent2 text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              ✏️ Custom
            </button>
          </div>
        </div>
        
        {topicMode === 'curriculum' ? (
          <div className="space-y-3">
            {isG7 ? (
              <>
                <select
                  value={chapter}
                  onChange={(e) => { setChapter(e.target.value); setSubtopics([]); }}
                  className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
                >
                  <option value="">Select chapter...</option>
                  {G7_CURRICULUM.map((c) => <option key={c.ch}>{c.ch}</option>)}
                </select>

                {chapter && (
                  <div className="grid grid-cols-1 gap-2">
                    <p className="font-dm text-[11px] text-muted uppercase tracking-wider mb-1">Select subtopics</p>
                    {selectedChapter?.topics.map((t) => (
                      <button
                        key={t}
                        onClick={() => toggleSubtopic(t)}
                        className={`p-3 rounded-xl border-2 text-left font-dm text-sm transition-all ${subtopics.includes(t)
                          ? 'border-accent2 bg-accent2/5 text-ink'
                          : 'border-border bg-card text-muted hover:border-border/80'
                          }`}
                      >
                        {subtopics.includes(t) ? '[x] ' : ''}{t}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-xl border-2 border-border bg-paper">
                <p className="font-dm text-sm text-muted">
                  📝 Structured curriculum is only available for Grade 7. 
                  Switch to <button type="button" onClick={() => setTopicMode('custom')} className="text-accent2 underline">Custom Topic</button> for other grades.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Enter your custom topic (e.g., Pythagorean Theorem, Quadratic Equations, Fractions)"
              className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2"
            />
            <p className="font-dm text-xs text-muted">
              💡 Tip: Be specific for better AI-generated questions. Include grade-level context if needed.
            </p>
          </div>
        )}
      </section>

      {/* Difficulty Level Selector */}
      <section>
        <label className="font-syne font-600 text-sm text-ink block mb-3">Difficulty Level</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DIFFICULTY_LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={() => setDifficulty(level.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                difficulty === level.id
                  ? `border-${level.color.replace('bg-', '')} bg-${level.color.replace('bg-', '')}/10`
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{level.icon}</span>
                <p className="font-syne font-700 text-sm text-ink">{level.label}</p>
              </div>
              <p className="font-dm text-xs text-muted">{level.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-2">
          <label className="font-syne font-600 text-sm text-ink">Questions</label>
          <span className="font-syne font-700 text-accent text-lg">{count}</span>
        </div>
        <input
          type="range"
          min={3}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </section>

      <section>
        <div className="flex justify-between items-center mb-2">
          <label className="font-syne font-600 text-sm text-ink">Time Limit (minutes)</label>
          <span className="font-syne font-700 text-accent2 text-lg">{timeLimit === 0 ? 'No limit' : `${timeLimit}m`}</span>
        </div>
        <input
          type="range"
          min={0}
          max={120}
          step={5}
          value={timeLimit}
          onChange={(e) => setTimeLimit(Number(e.target.value))}
          className="w-full accent-accent2"
        />
      </section>

      {/* Question Types with Weights */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <label className="font-syne font-600 text-sm text-ink">📝 Question Types & Weights</label>
          <span className="font-dm text-xs text-muted">Set priority for each type</span>
        </div>
        
        {types.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Select at least one question type below</p>
        ) : (
          <div className="space-y-3">
            {types.map((typeId) => {
              const typeInfo = QUESTION_TYPES.find((t) => t.id === typeId);
              const weight = typeWeights[typeId] || 0;
              return (
                <div key={typeId} className="p-3 rounded-xl border-2 border-border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-dm text-sm text-ink">{typeInfo?.label}</span>
                    <span className="font-syne font-700 text-sm text-accent2">{weight}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={weight}
                    onChange={(e) => updateTypeWeight(typeId, e.target.value)}
                    className="w-full accent-accent2"
                  />
                </div>
              );
            })}
            
            <div className="flex items-center justify-between p-3 rounded-xl bg-paper border border-border">
              <span className="font-dm text-sm text-muted">Total</span>
              <span className={`font-syne font-800 text-lg ${
                Object.values(typeWeights).reduce((a, b) => a + b, 0) === 100
                  ? 'text-correct'
                  : 'text-wrong'
              }`}>
                {Object.values(typeWeights).reduce((a, b) => a + b, 0)}%
              </span>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          {QUESTION_TYPES.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleType(item.id)}
              className={`p-3 rounded-xl border-2 text-left font-dm text-sm transition-all ${
                types.includes(item.id)
                  ? 'border-accent2 bg-accent2/5 text-ink'
                  : 'border-border bg-card text-muted hover:border-border/80'
              }`}
            >
              {types.includes(item.id) ? '✓ ' : ''}{item.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="font-syne font-600 text-sm text-ink block mb-2">Extra Instructions (optional)</label>
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="e.g. include more word problems"
          rows={3}
          className="w-full p-3 rounded-xl border-2 border-border bg-card font-dm text-sm outline-none focus:border-accent2 resize-none"
        />
      </section>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-dm text-wrong">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className="w-full py-4 rounded-xl bg-accent text-white font-syne font-700 text-base disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/90 active:scale-[0.98] transition-all"
      >
        {loading ? 'Creating...' : 'Create Activity ->'}
      </button>
    </div>
  );
}
