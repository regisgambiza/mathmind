// Skill prerequisite mapping for math topics
// Defines which skills should be mastered before tackling advanced ones

export const SKILL_PREREQUISITES = {
  // Fractions
  'Fraction Multiplication': {
    prerequisites: ['Basic Multiplication', 'Understanding Fractions', 'Simplifying Fractions'],
    leadsTo: ['Fraction Division', 'Mixed Number Operations', 'Ratio and Proportion'],
    category: 'fractions',
  },
  'Fraction Division': {
    prerequisites: ['Fraction Multiplication', 'Reciprocals', 'Basic Division'],
    leadsTo: ['Complex Fractions', 'Algebraic Fractions'],
    category: 'fractions',
  },
  'Simplifying Fractions': {
    prerequisites: ['Factors and Multiples', 'Greatest Common Factor', 'Basic Division'],
    leadsTo: ['Fraction Multiplication', 'Fraction Addition', 'Fraction Subtraction'],
    category: 'fractions',
  },
  'Fraction Addition': {
    prerequisites: ['Understanding Fractions', 'Common Denominators', 'Basic Addition'],
    leadsTo: ['Mixed Number Addition', 'Fraction Multiplication'],
    category: 'fractions',
  },
  'Fraction Subtraction': {
    prerequisites: ['Understanding Fractions', 'Common Denominators', 'Basic Subtraction'],
    leadsTo: ['Mixed Number Subtraction', 'Fraction Operations'],
    category: 'fractions',
  },
  'Understanding Fractions': {
    prerequisites: ['Basic Division', 'Parts of a Whole', 'Number Lines'],
    leadsTo: ['Simplifying Fractions', 'Equivalent Fractions', 'Fraction Comparison'],
    category: 'fractions',
  },
  'Equivalent Fractions': {
    prerequisites: ['Understanding Fractions', 'Multiplication Tables', 'Division Facts'],
    leadsTo: ['Simplifying Fractions', 'Common Denominators', 'Fraction Operations'],
    category: 'fractions',
  },
  'Common Denominators': {
    prerequisites: ['Equivalent Fractions', 'Least Common Multiple', 'Multiplication Tables'],
    leadsTo: ['Fraction Addition', 'Fraction Subtraction', 'Fraction Comparison'],
    category: 'fractions',
  },

  // Decimals
  'Decimal Operations': {
    prerequisites: ['Understanding Decimals', 'Place Value', 'Basic Arithmetic'],
    leadsTo: ['Percent Calculations', 'Scientific Notation', 'Financial Math'],
    category: 'decimals',
  },
  'Understanding Decimals': {
    prerequisites: ['Place Value', 'Fraction Basics', 'Number Lines'],
    leadsTo: ['Decimal Operations', 'Decimal Comparison', 'Rounding Decimals'],
    category: 'decimals',
  },
  'Decimal to Fraction': {
    prerequisites: ['Understanding Decimals', 'Understanding Fractions', 'Division'],
    leadsTo: ['Fraction to Decimal', 'Percent Conversions', 'Rational Numbers'],
    category: 'decimals',
  },

  // Percentages
  'Percent Calculations': {
    prerequisites: ['Decimal Operations', 'Fraction Basics', 'Ratio Basics'],
    leadsTo: ['Percentage Increase/Decrease', 'Simple Interest', 'Discounts and Tax'],
    category: 'percentages',
  },
  'Percentage Increase/Decrease': {
    prerequisites: ['Percent Calculations', 'Decimal Operations', 'Basic Algebra'],
    leadsTo: ['Compound Interest', 'Growth and Decay', 'Financial Applications'],
    category: 'percentages',
  },

  // Basic Arithmetic
  'Basic Multiplication': {
    prerequisites: ['Addition Facts', 'Skip Counting', 'Number Sense'],
    leadsTo: ['Multi-digit Multiplication', 'Fraction Multiplication', 'Area Models'],
    category: 'arithmetic',
  },
  'Basic Division': {
    prerequisites: ['Multiplication Facts', 'Subtraction', 'Equal Groups'],
    leadsTo: ['Long Division', 'Fraction Division', 'Ratio'],
    category: 'arithmetic',
  },
  'Basic Addition': {
    prerequisites: ['Counting', 'Number Recognition', 'One-to-One Correspondence'],
    leadsTo: ['Multi-digit Addition', 'Integer Addition', 'Fraction Addition'],
    category: 'arithmetic',
  },
  'Basic Subtraction': {
    prerequisites: ['Counting Backwards', 'Number Recognition', 'Basic Addition'],
    leadsTo: ['Multi-digit Subtraction', 'Integer Subtraction', 'Fraction Subtraction'],
    category: 'arithmetic',
  },

  // Algebra
  'Basic Algebra': {
    prerequisites: ['Arithmetic Operations', 'Order of Operations', 'Variable Concepts'],
    leadsTo: ['Solving Equations', 'Linear Functions', 'Systems of Equations'],
    category: 'algebra',
  },
  'Solving Equations': {
    prerequisites: ['Basic Algebra', 'Inverse Operations', 'Equality Properties'],
    leadsTo: ['Multi-step Equations', 'Inequalities', 'Quadratic Equations'],
    category: 'algebra',
  },
  'Linear Functions': {
    prerequisites: ['Solving Equations', 'Coordinate Plane', 'Slope Concept'],
    leadsTo: ['Systems of Equations', 'Linear Inequalities', 'Function Transformations'],
    category: 'algebra',
  },
  'Expressions and Variables': {
    prerequisites: ['Arithmetic Operations', 'Order of Operations', 'Number Properties'],
    leadsTo: ['Basic Algebra', 'Simplifying Expressions', 'Factoring'],
    category: 'algebra',
  },

  // Geometry
  'Area and Perimeter': {
    prerequisites: ['Multiplication', 'Addition', 'Understanding Shapes'],
    leadsTo: ['Surface Area', 'Volume', 'Circle Measurements'],
    category: 'geometry',
  },
  'Angle Relationships': {
    prerequisites: ['Understanding Angles', 'Protractor Use', 'Basic Geometry'],
    leadsTo: ['Triangle Angles', 'Parallel Lines', 'Polygon Angles'],
    category: 'geometry',
  },
  'Pythagorean Theorem': {
    prerequisites: ['Square Roots', 'Right Triangles', 'Basic Algebra'],
    leadsTo: ['Distance Formula', 'Trigonometry', '3D Geometry'],
    category: 'geometry',
  },

  // Statistics & Probability
  'Basic Probability': {
    prerequisites: ['Fractions', 'Percentages', 'Ratio'],
    leadsTo: ['Compound Probability', 'Independent Events', 'Expected Value'],
    category: 'statistics',
  },
  'Data Analysis': {
    prerequisites: ['Reading Graphs', 'Basic Statistics', 'Mean/Median/Mode'],
    leadsTo: ['Probability', 'Statistical Inference', 'Data Interpretation'],
    category: 'statistics',
  },
  'Mean Median Mode': {
    prerequisites: ['Basic Arithmetic', 'Ordering Numbers', 'Data Collection'],
    leadsTo: ['Range and Spread', 'Data Analysis', 'Statistical Measures'],
    category: 'statistics',
  },

  // Number Theory
  'Factors and Multiples': {
    prerequisites: ['Multiplication Tables', 'Division Facts', 'Number Patterns'],
    leadsTo: ['Prime Factorization', 'GCF and LCM', 'Simplifying Fractions'],
    category: 'number_theory',
  },
  'Prime Factorization': {
    prerequisites: ['Factors and Multiples', 'Prime Numbers', 'Division'],
    leadsTo: ['GCF and LCM', 'Square Roots', 'Rational Numbers'],
    category: 'number_theory',
  },

  // General
  'Word Problems': {
    prerequisites: ['Reading Comprehension', 'Basic Arithmetic', 'Problem Solving Strategies'],
    leadsTo: ['Multi-step Problems', 'Algebra Word Problems', 'Real-world Applications'],
    category: 'general',
  },
  'Problem Solving': {
    prerequisites: ['Critical Thinking', 'Basic Arithmetic', 'Logical Reasoning'],
    leadsTo: ['Complex Problem Solving', 'Mathematical Proofs', 'Applied Mathematics'],
    category: 'general',
  },
};

export const CATEGORY_COLORS = {
  fractions: 'bg-blue-500',
  decimals: 'bg-green-500',
  percentages: 'bg-purple-500',
  arithmetic: 'bg-orange-500',
  algebra: 'bg-red-500',
  geometry: 'bg-pink-500',
  statistics: 'bg-teal-500',
  number_theory: 'bg-indigo-500',
  general: 'bg-gray-500',
};

export const CATEGORY_LABELS = {
  fractions: 'Fractions',
  decimals: 'Decimals',
  percentages: 'Percentages',
  arithmetic: 'Arithmetic',
  algebra: 'Algebra',
  geometry: 'Geometry',
  statistics: 'Statistics',
  number_theory: 'Number Theory',
  general: 'General',
};

/**
 * Get prerequisites for a skill
 */
export function getPrerequisites(skillName) {
  const skill = SKILL_PREREQUISITES[skillName];
  if (!skill) return [];
  return skill.prerequisites || [];
}

/**
 * Get skills that this skill leads to
 */
export function getLeadsTo(skillName) {
  const skill = SKILL_PREREQUISITES[skillName];
  if (!skill) return [];
  return skill.leadsTo || [];
}

/**
 * Get category for a skill
 */
export function getSkillCategory(skillName) {
  const skill = SKILL_PREREQUISITES[skillName];
  return skill?.category || 'general';
}

/**
 * Find review suggestions based on weak skills
 * Returns skills that should be mastered before the weak skill
 */
export function suggestReviewTopics(weakSkills) {
  const suggestions = [];

  for (const skill of weakSkills) {
    const prereqs = getPrerequisites(skill);
    for (const prereq of prereqs) {
      suggestions.push({
        skill: prereq,
        becauseOf: skill,
        category: getSkillCategory(prereq),
        priority: 'high',
      });
    }
  }

  // Remove duplicates
  const unique = [];
  const seen = new Set();
  for (const s of suggestions) {
    if (!seen.has(s.skill)) {
      seen.add(s.skill);
      unique.push(s);
    }
  }

  return unique;
}

/**
 * Calculate readiness score for a skill based on mastery of prerequisites
 */
export function calculateReadinessScore(skillName, masteryMap) {
  const prereqs = getPrerequisites(skillName);
  if (prereqs.length === 0) return 100;

  let totalMastery = 0;
  for (const prereq of prereqs) {
    const mastery = masteryMap[prereq] || 0;
    totalMastery += mastery;
  }

  return Math.round(totalMastery / prereqs.length);
}

/**
 * Get learning path from current skill to target skill
 */
export function getLearningPath(fromSkill, toSkill, visited = new Set()) {
  if (fromSkill === toSkill) return [fromSkill];
  if (visited.has(fromSkill)) return null;

  visited.add(fromSkill);

  const leadsTo = getLeadsTo(fromSkill);
  for (const next of leadsTo) {
    const path = getLearningPath(next, toSkill, new Set(visited));
    if (path) return [fromSkill, ...path];
  }

  return null;
}
