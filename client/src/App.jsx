import { HashRouter, Routes, Route } from 'react-router-dom';
import { RegisProvider } from './context/RegisContext';
import { QuizProvider } from './context/QuizContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { StudentProvider } from './context/StudentContext';
import ProtectedRoute from './components/ProtectedRoute';
import StudentProtectedRoute from './components/StudentProtectedRoute';
import Home from './pages/Home';
import TeacherSetup from './pages/TeacherSetup';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherHistory from './pages/TeacherHistory';
import TeacherLogin from './pages/TeacherLogin';
import TeacherHome from './pages/TeacherHome';
import TeacherAdmin from './pages/TeacherAdmin';
import TeacherLiveTracking from './pages/TeacherLiveTracking';
import TeacherLayout from './components/TeacherLayout';
import StudentJoin from './pages/StudentJoin';
import StudentLogin from './pages/StudentLogin';
import StudentDashboard from './pages/StudentDashboard';
import PracticeMode from './pages/PracticeMode';
import PracticeQuizPage from './pages/PracticeQuizPage';
import PracticeResults from './pages/PracticeResults';
import QuizLoading from './pages/QuizLoading';
import QuizPage from './pages/QuizPage';
import Results from './pages/Results';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StudentProvider>
          <RegisProvider>
            <QuizProvider>
              <HashRouter
                future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true,
                }}
              >
                <div className="min-h-screen bg-paper">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/teacher/login" element={<TeacherLogin />} />

                    <Route path="/teacher/dashboard-home" element={<ProtectedRoute><TeacherLayout><TeacherHome /></TeacherLayout></ProtectedRoute>} />
                    <Route path="/teacher/setup" element={<ProtectedRoute><TeacherLayout><TeacherSetup /></TeacherLayout></ProtectedRoute>} />
                    <Route path="/teacher/dashboard" element={<ProtectedRoute><TeacherLayout><TeacherDashboard /></TeacherLayout></ProtectedRoute>} />
                    <Route path="/teacher/history" element={<ProtectedRoute><TeacherLayout><TeacherHistory /></TeacherLayout></ProtectedRoute>} />
                    <Route path="/teacher/history/:code" element={<ProtectedRoute><TeacherLayout><TeacherHistory /></TeacherLayout></ProtectedRoute>} />
                    <Route path="/teacher/live/:code" element={<ProtectedRoute><TeacherLayout><TeacherLiveTracking /></TeacherLayout></ProtectedRoute>} />
                    <Route path="/teacher/admin" element={<ProtectedRoute><TeacherLayout><TeacherAdmin /></TeacherLayout></ProtectedRoute>} />

                    <Route path="/student/login" element={<StudentLogin />} />
                    <Route path="/student/dashboard" element={<StudentProtectedRoute><StudentDashboard /></StudentProtectedRoute>} />
                    <Route path="/student/practice" element={<StudentProtectedRoute><PracticeMode /></StudentProtectedRoute>} />
                    <Route path="/student/practice/results" element={<StudentProtectedRoute><PracticeResults /></StudentProtectedRoute>} />
                    <Route path="/practice/quiz" element={<StudentProtectedRoute><PracticeQuizPage /></StudentProtectedRoute>} />
                    <Route path="/student/join" element={<StudentProtectedRoute><StudentJoin /></StudentProtectedRoute>} />
                    <Route path="/quiz/loading" element={<QuizLoading />} />
                    <Route path="/quiz" element={<QuizPage />} />
                    <Route path="/results" element={<Results />} />
                  </Routes>
                </div>
              </HashRouter>
            </QuizProvider>
          </RegisProvider>
        </StudentProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
