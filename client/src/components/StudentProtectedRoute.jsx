import { Navigate } from 'react-router-dom';
import { useStudent } from '../context/StudentContext';

export default function StudentProtectedRoute({ children }) {
  const { isStudentAuthenticated, loading } = useStudent();

  if (loading) return null;
  if (!isStudentAuthenticated) return <Navigate to="/student/login" replace />;
  return children;
}

