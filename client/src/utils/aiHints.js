/**
 * AI-powered hint generation for quiz questions
 */

import { useRegis } from '../context/RegisContext';

/**
 * Generate a hint for a specific question
 * @param {string} questionText - The question text
 * @param {string} questionType - Type of question (multiple_choice, true_false, etc.)
 * @param {string} skillTag - The skill being tested
 * @param {string} difficulty - Difficulty level (foundation, core, advanced)
 * @param {string} studentAnswer - Optional: student's current answer (for follow-up hints)
 * @param {boolean} isWrong - Optional: whether the student's answer was wrong
 * @returns {Promise<string>} - The generated hint
 */
export async function generateHint({
  questionText,
  questionType,
  skillTag,
  difficulty,
  studentAnswer,
  isWrong,
  generateCompletion,
}) {
  let prompt = '';

  if (isWrong && studentAnswer) {
    // Follow-up hint after wrong answer
    prompt = `You are a helpful math tutor. A student got this question wrong.

Question (${questionType}, ${difficulty}, skill: ${skillTag}):
${questionText}

Student's answer: ${studentAnswer}

Provide a SHORT, encouraging hint (2-3 sentences max) that:
1. Acknowledges their effort
2. Points out the specific mistake or misconception
3. Gives a hint about the correct approach WITHOUT giving away the answer
4. Uses simple, age-appropriate language

Do NOT reveal the correct answer. Keep it under 50 words.`;
  } else {
    // Initial hint request
    prompt = `You are a helpful math tutor. A student is asking for a hint on this question.

Question (${questionType}, ${difficulty}, skill: ${skillTag}):
${questionText}

Provide a SHORT hint (2-3 sentences max) that:
1. Breaks down what the question is asking
2. Suggests a strategy or first step
3. Reminds them of a relevant formula or concept if applicable
4. Encourages them to try

Do NOT give away the answer. Keep it under 50 words. Use simple, encouraging language.`;
  }

  try {
    const hint = await generateCompletion(prompt);
    return hint.trim() || 'Try breaking down the question into smaller parts. What information do you know? What are you trying to find?';
  } catch (err) {
    console.error('Hint generation failed:', err);
    return 'Think about what you know and what you need to find. Try working through it step by step.';
  }
}

/**
 * Generate step-by-step explanation after quiz completion
 * @param {object} question - The question object
 * @param {string} studentAnswer - The student's answer
 * @param {string} correctAnswer - The correct answer
 * @param {boolean} isCorrect - Whether the student was correct
 * @returns {Promise<string>} - The generated explanation
 */
export async function generateExplanation({
  question,
  studentAnswer,
  correctAnswer,
  isCorrect,
  generateCompletion,
}) {
  const prompt = `You are a helpful math tutor explaining the solution to a student.

Question (${question.type}, ${question.difficulty}, skill: ${question.skill_tag || 'General'}):
${question.question}

Student's answer: ${typeof studentAnswer === 'string' ? studentAnswer : JSON.stringify(studentAnswer)}
Correct answer: ${typeof correctAnswer === 'string' ? correctAnswer : JSON.stringify(correctAnswer)}
Student was: ${isCorrect ? 'CORRECT' : 'INCORRECT'}

Provide a clear, step-by-step explanation that:
1. ${isCorrect ? 'Confirms why their answer is correct and reinforces the concept' : 'Explains where they went wrong and shows the correct approach'}
2. Shows the working steps clearly
3. Explains the key concept or skill being tested
4. Gives a tip for similar problems in the future

Use simple, encouraging language. Format with clear steps using numbers or bullets. Keep it under 150 words.`;

  try {
    const explanation = await generateCompletion(prompt);
    return explanation.trim() || question.explanation || 'Review the concept and try again.';
  } catch (err) {
    console.error('Explanation generation failed:', err);
    return question.explanation || 'Review the steps and try again.';
  }
}

/**
 * Generate encouragement message based on performance
 */
export async function generateEncouragement({
  score,
  total,
  improvement,
  streak,
  generateCompletion,
}) {
  const prompt = `You are an encouraging math tutor. A student just completed a quiz.

Score: ${score}/${total} (${Math.round((score / total) * 100)}%)
${improvement !== undefined ? `Improvement from last time: ${improvement > 0 ? '+' : ''}${improvement}%` : ''}
${streak !== undefined ? `Current streak: ${streak} days` : ''}

Write a SHORT, enthusiastic encouragement message (2-3 sentences). 
${score / total >= 0.8 ? 'Celebrate their great performance.' : 
  score / total >= 0.5 ? 'Acknowledge their effort and encourage continued practice.' : 
  'Be extra supportive and emphasize that practice leads to improvement.'}

Keep it under 40 words. Use emojis sparingly (1-2 max).`;

  try {
    const message = await generateCompletion(prompt);
    return message.trim();
  } catch {
    // Fallback messages based on score
    const fallbacks = [
      score / total >= 0.8 ? '🌟 Amazing work! You really understand this topic!' :
      score / total >= 0.5 ? '💪 Good effort! Keep practicing and you\'ll improve!' :
      '🌱 Every mistake is a learning opportunity. Keep going!',
    ];
    return fallbacks[0];
  }
}

/**
 * Hook for using hint generation in components
 */
export function useHintGenerator() {
  const { generateCompletion } = useRegis();

  const getHint = async (question, studentAnswer = null, isWrong = false) => {
    return generateHint({
      questionText: question.question,
      questionType: question.type,
      skillTag: question.skill_tag || 'General',
      difficulty: question.difficulty || 'core',
      studentAnswer,
      isWrong,
      generateCompletion,
    });
  };

  const getExplanation = async (question, studentAnswer, correctAnswer, isCorrect) => {
    return generateExplanation({
      question,
      studentAnswer,
      correctAnswer,
      isCorrect,
      generateCompletion,
    });
  };

  const getEncouragement = async (score, total, improvement, streak) => {
    return generateEncouragement({
      score,
      total,
      improvement,
      streak,
      generateCompletion,
    });
  };

  return { getHint, getExplanation, getEncouragement };
}
