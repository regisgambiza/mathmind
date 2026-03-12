import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuiz } from '../context/QuizContext';
import { useStudent } from '../context/StudentContext';
import TopBar from '../components/TopBar';
import api from '../hooks/useApi';

export default function StudentJoin() {
  const navigate = useNavigate();
  const { student, isStudentAuthenticated } = useStudent();
  const {
    setStudentName,
    setQuizConfig,
    setAttemptId,
    setQuizCode,
    setTimeLimit,
    setSubmissionRewards,
    setCurrentQuestions,
  } = useQuiz();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isStudentAuthenticated) {
      navigate('/student/login', { replace: true, state: { from: '/student/join' } });
    }
  }, [isStudentAuthenticated, navigate]);

  const handleSubmit = async () => {
    if (!code.trim() || !student?.id) return;
    setLoading(true);
    setError('');
    try {
      const normalizedCode = code.toUpperCase();
      const quizRes = await api.get(`/api/quiz/${normalizedCode}`);
      const quiz = quizRes.data;

      const attemptRes = await api.post('/api/attempt/start', {
        quiz_code: normalizedCode,
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
      });

      setStudentName(student.name);
      const parsedSubtopics = Array.isArray(quiz.subtopic)
        ? quiz.subtopic
        : (() => {
          try {
            return quiz.subtopic ? JSON.parse(quiz.subtopic) : [];
          } catch {
            return [];
          }
        })();
      setQuizConfig({
        topic: quiz.topic,
        grade: quiz.grade,
        count: quiz.q_count,
        types: quiz.question_types,
        extra: quiz.extra_instructions || '',
        chapter: quiz.chapter || quiz.topic,
        subtopics: parsedSubtopics,
        activity_type: quiz.activity_type || 'class_activity',
        class_name: quiz.class_name || null,
        section_name: quiz.section_name || null,
      });
      setAttemptId(attemptRes.data.attempt_id);
      setQuizCode(normalizedCode);
      setTimeLimit(Number(quiz.time_limit_mins) || 0);
      setSubmissionRewards(null);
      navigate('/quiz/loading');
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Quiz code not found. Check with your teacher.');
      } else if (err.response?.status === 403 || err.response?.status === 423) {
        const data = err.response?.data || {};
        if (data.code === 'not_open_yet' && data.release_at) {
          const when = new Date(data.release_at);
          setError(`This quiz opens at ${Number.isNaN(when.getTime()) ? data.release_at : when.toLocaleString()}.`);
        } else if (data.code === 'closed' || data.code === 'assignment_closed') {
          setError('This quiz is closed. Ask your teacher for a new assignment window.');
        } else if (data.code === 'assignment_paused') {
          setError('This assignment is temporarily paused by the teacher.');
        } else if (data.code === 'not_enrolled') {
          setError('You are not enrolled in this course. Please contact your teacher.');
        } else if (data.code === 'email_required') {
          setError('Student email is required for this quiz.');
        } else {
          setError(data.error || 'This quiz is not currently available.');
        }
      } else {
        setError('Could not connect to server. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    if (!student?.name) return;
    setStudentName(student.name);
    setQuizCode('DEMO');
    setQuizConfig(null);
    setAttemptId(null);
    setCurrentQuestions([]);
    setTimeLimit(0);
    setSubmissionRewards(null);
    navigate('/quiz/loading');
  };

  if (!isStudentAuthenticated) return null;

  return (
    <div className="min-h-screen bg-paper">
      <TopBar title="Join Quiz" showBack role="student" onBack={() => navigate('/student/dashboard')} />
      <div className="max-w-[480px] mx-auto px-5 py-8 animate-fadeUp">
        <h1 className="font-syne font-800 text-3xl text-ink mb-2">Join a Quiz</h1>
        <p className="font-dm text-muted text-sm mb-8">Enter the quiz code your teacher shared</p>

        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-accent2/20 bg-accent2/5">
            <p className="font-dm text-xs text-muted uppercase tracking-wider mb-1">Student</p>
            <p className="font-syne font-700 text-ink">{student?.name}</p>
          </div>

          <div>
            <label className="font-syne font-600 text-sm text-ink block mb-2">Quiz Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. MTH4"
              maxLength={8}
              className="w-full p-4 rounded-xl border-2 border-border bg-card font-syne font-700 text-xl tracking-[0.25em] text-center outline-none focus:border-accent2 transition-colors uppercase"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-dm text-wrong">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!code.trim() || loading}
          className="mt-6 w-full py-4 rounded-xl bg-accent2 text-white font-syne font-700 text-base disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent2/90 active:scale-[0.98] transition-all"
        >
          {loading ? 'Joining...' : 'Start My Quiz'}
        </button>

        <div className="text-center mt-5 space-y-2">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="font-dm text-muted text-sm hover:text-accent2 underline transition-colors"
          >
            Back to dashboard
          </button>
          <div>
            <button
              onClick={handleDemo}
              className="font-dm text-muted text-xs hover:text-accent2 underline transition-colors"
            >
              Try demo quiz (not tracked)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
