import { createContext, useContext, useState } from 'react';

const QuizContext = createContext(null);

export function QuizProvider({ children }) {
  const [quizConfig, setQuizConfig] = useState(null);
  const [quizCode, setQuizCode] = useState('');
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [studentName, setStudentName] = useState('');
  const [attemptId, setAttemptId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [timeLimit, setTimeLimit] = useState(0); // in minutes
  const [chapter, setChapter] = useState('');
  const [subtopics, setSubtopics] = useState([]);
  const [submissionRewards, setSubmissionRewards] = useState(null);

  const resetQuizSession = () => {
    setQuizConfig(null);
    setQuizCode('');
    setCurrentQuestions([]);
    setAttemptId(null);
    setAnswers({});
    setScore(0);
    setTimeLimit(0);
    setChapter('');
    setSubtopics([]);
    setSubmissionRewards(null);
  };

  return (
    <QuizContext.Provider value={{
      quizConfig, setQuizConfig,
      quizCode, setQuizCode,
      currentQuestions, setCurrentQuestions,
      studentName, setStudentName,
      attemptId, setAttemptId,
      answers, setAnswers,
      score, setScore,
      timeLimit, setTimeLimit,
      chapter, setChapter,
      subtopics, setSubtopics,
      submissionRewards, setSubmissionRewards,
      resetQuizSession,
    }}>
      {children}
    </QuizContext.Provider>
  );
}

export function useQuiz() {
  return useContext(QuizContext);
}
