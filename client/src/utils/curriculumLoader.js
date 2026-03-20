/**
 * Curriculum context loader for frontend AI question generation.
 * Loads structured curriculum data from JSON files to provide context for AI-generated questions.
 */

// Curriculum data will be loaded dynamically since books/ is outside the src/ directory
let grade7Curriculum = null;
let grade8Curriculum = null;

/**
 * Load curriculum data dynamically.
 * Note: books/ directory is at project root, not bundled with Vite.
 * We'll fetch from the public path or use embedded data.
 */
async function loadCurriculumData(grade) {
  const cache = grade === 7 ? grade7Curriculum : grade8Curriculum;
  if (cache) return cache;
  
  // Parse grade to ensure it's a number
  const gradeStr = String(grade || '');
  const gradeNum = parseInt(gradeStr.replace(/[^0-9]/g, ''), 10);
  
  console.log('[curriculumLoader] loadCurriculumData called with:', { 
    original: grade, 
    parsed: gradeNum,
    gradeStr 
  });
  
  if (!gradeNum || (gradeNum !== 7 && gradeNum !== 8)) {
    console.warn(`Invalid grade: ${grade} (parsed: ${gradeNum}), using grade 7 as fallback`);
    return null;
  }
  
  try {
    // Try to fetch from the server (books should be served statically or via API)
    const response = await fetch(`/books/Grade_${gradeNum}_Maths.json`);
    if (!response.ok) throw new Error('Failed to load curriculum');
    const data = await response.json();
    
    if (gradeNum === 7) {
      grade7Curriculum = data;
    } else {
      grade8Curriculum = data;
    }
    
    console.log('[curriculumLoader] Successfully loaded Grade', gradeNum, 'curriculum');
    return data;
  } catch (error) {
    console.warn(`Could not load Grade ${gradeNum} curriculum, using fallback:`, error.message);
    return null;
  }
}

/**
 * Get curriculum data for a specific grade level.
 * @param {number|string} grade - Grade level (7 or 8)
 * @returns {object|null} Curriculum data or null
 */
export async function getCurriculumForGrade(grade) {
  // Handle "Grade 7", "7", 7, "grade7", etc.
  const gradeNum = typeof grade === 'number' 
    ? grade 
    : parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10);
  return await loadCurriculumData(gradeNum);
}

/**
 * Find a specific topic in the curriculum.
 * @param {number|string} grade - Grade level
 * @param {string} topicName - Topic name to search for
 * @param {string} chapter - Chapter name
 * @param {string|array} subtopic - Subtopic name or array
 * @returns {Promise<object|null>} Topic context or null
 */
export async function findTopicInCurriculum(grade, topicName = null, chapter = null, subtopic = null) {
  const gradeNum = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10) || 7;
  const curriculum = await getCurriculumForGrade(gradeNum);
  if (!curriculum) return null;

  const topicSearch = (topicName || '').toLowerCase().trim();
  const chapterSearch = (chapter || '').toLowerCase().trim();
  const subtopicSearch = Array.isArray(subtopic) 
    ? (subtopic[0] || '').toLowerCase().trim()
    : (subtopic || '').toLowerCase().trim();

  for (const currChapter of curriculum.chapters) {
    const chapterName = (currChapter.chapter || '').toLowerCase();

    for (const topic of currChapter.topics || []) {
      const topicNameField = (topic.name || '').toLowerCase();

      // Check if chapter matches (by chapter number or name)
      const chapterMatches = chapterSearch && (
        chapterName.includes(chapterSearch) ||
        chapterSearch.includes(chapterName.split(':')[0]) ||
        topicNameField.includes(chapterSearch)
      );

      // Check if topic matches
      const topicMatches = (
        topicSearch && (
          topicNameField.includes(topicSearch) ||
          topicSearch.includes(topicNameField.split(' ')[0])
        )
      ) || (
        subtopicSearch && (
          topicNameField.includes(subtopicSearch) ||
          topicNameField.startsWith(subtopicSearch)
        )
      );

      if (topicMatches || chapterMatches) {
        return {
          topic,
          chapter: currChapter,
          grade: gradeNum,
          curriculumMetadata: {
            book: curriculum.book || '',
            gradeLevel: curriculum.grade_level || gradeNum,
            curriculum: curriculum.curriculum || '',
          },
        };
      }
    }
  }

  return null;
}

/**
 * Build a formatted context string for AI prompts.
 * @param {number|string} grade - Grade level
 * @param {string} topicName - Topic name
 * @param {string} chapter - Chapter name
 * @param {string|array} subtopic - Subtopic name or array
 * @returns {Promise<string>} Formatted curriculum context
 */
export async function buildCurriculumContext(grade, topicName = null, chapter = null, subtopic = null) {
  const gradeNum = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10) || 7;
  const result = await findTopicInCurriculum(gradeNum, topicName, chapter, subtopic);

  if (!result || !result.topic) {
    return `CURRICULUM CONTEXT:
Grade ${gradeNum} Mathematics
Note: Specific topic not found in curriculum. Generate age-appropriate questions.`;
  }

  const { topic, chapter: chapterData, curriculumMetadata } = result;
  const lines = [
    'CURRICULUM CONTEXT:',
    `Textbook: ${curriculumMetadata.book || 'Unknown'}`,
    `Grade Level: ${curriculumMetadata.gradeLevel || grade}`,
    `Chapter: ${chapterData.chapter || 'Unknown'}`,
    `Topic: ${topic.name || 'Unknown'}`,
    `Book Pages: ${topic.book1_pages || 'N/A'}`,
    '',
    'LEARNING OBJECTIVES:',
  ];

  (topic.learning_objectives || []).forEach(obj => {
    lines.push(`  - ${obj}`);
  });

  lines.push('');
  lines.push('KEY CONCEPTS:');
  (topic.key_concepts || []).forEach(concept => {
    lines.push(`  - ${concept}`);
  });

  lines.push('');
  lines.push('TERMINOLOGY (use these exact terms):');
  (topic.terminology || []).forEach(term => {
    lines.push(`  - ${term}`);
  });

  lines.push('');
  lines.push('SUBSKILLS TO TEST:');
  (topic.subskills || []).forEach(skill => {
    lines.push(`  - ${skill}`);
  });

  if (topic.example_problems?.length) {
    lines.push('');
    lines.push('EXAMPLE PROBLEM STYLES (match these formats):');
    topic.example_problems.slice(0, 3).forEach(prob => {
      lines.push(`  - ${prob}`);
    });
  }

  if (topic.common_mistakes?.length) {
    lines.push('');
    lines.push('COMMON MISTAKES (use as distractors in multiple choice):');
    topic.common_mistakes.forEach(mistake => {
      lines.push(`  - ${mistake}`);
    });
  }

  if (topic.question_style_notes) {
    lines.push('');
    lines.push('QUESTION STYLE GUIDANCE:');
    lines.push(`  ${topic.question_style_notes}`);
  }

  if (topic.real_life_applications?.length) {
    lines.push('');
    lines.push('REAL-LIFE APPLICATIONS (for word problems):');
    topic.real_life_applications.slice(0, 2).forEach(app => {
      lines.push(`  - ${app}`);
    });
  }

  return lines.join('\n');
}

/**
 * Get all topics for a grade level as a flat list.
 * @param {number|string} grade - Grade level
 * @returns {Promise<array>} List of topic dictionaries
 */
export async function getAllTopicsForGrade(grade) {
  const curriculum = await getCurriculumForGrade(grade);
  if (!curriculum) return [];

  const topics = [];
  curriculum.chapters.forEach(chapter => {
    (chapter.topics || []).forEach(topic => {
      topics.push({
        chapter: chapter.chapter || '',
        topic,
        grade: Number(grade),
      });
    });
  });

  return topics;
}
