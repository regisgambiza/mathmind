"""
Curriculum context loader for AI question generation.
Loads structured curriculum data from JSON files to provide context for AI-generated questions.
"""
import json
import os

# Path to curriculum JSON files (project root books directory)
# This works whether running from server-python or project root
CURRICULUM_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'books')
if not os.path.exists(CURRICULUM_DIR):
    # Fallback: try relative to current working directory
    CURRICULUM_DIR = os.path.join(os.getcwd(), 'books')

def get_curriculum_for_grade(grade):
    """
    Load curriculum JSON for a specific grade level.
    
    Args:
        grade: Grade level (7 or 8)
    
    Returns:
        dict: Curriculum data or None if not found
    """
    filename = os.path.join(CURRICULUM_DIR, f'Grade_{grade}_Maths.json')
    
    if not os.path.exists(filename):
        return None
    
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading curriculum file {filename}: {e}")
        return None

def find_topic_in_curriculum(grade, topic_name=None, chapter=None, subtopic=None):
    """
    Find a specific topic in the curriculum and return its context.
    
    Args:
        grade: Grade level (7 or 8)
        topic_name: Topic name to search for (e.g., "Fractions", "1.1 Divisibility tests")
        chapter: Chapter name or number (e.g., "Chapter 1", "Chapter 1: Factors")
        subtopic: Specific subtopic name (e.g., "1.1 Divisibility tests")
    
    Returns:
        dict: Topic context with learning objectives, key concepts, etc. or None
    """
    curriculum = get_curriculum_for_grade(grade)
    if not curriculum:
        return None
    
    # Normalize search terms
    topic_search = (topic_name or '').lower().strip()
    chapter_search = (chapter or '').lower().strip()
    subtopic_search = (subtopic or '').lower().strip() if isinstance(subtopic, str) else ''
    
    # If subtopic is a list (JSON array), use the first item
    if isinstance(subtopic, list) and len(subtopic) > 0:
        subtopic_search = subtopic[0].lower().strip()
    
    for curr_chapter in curriculum['chapters']:
        chapter_name = curr_chapter.get('chapter', '').lower()
        
        # Check if chapter matches
        chapter_matches = (
            chapter_search and (
                chapter_search in chapter_name or 
                chapter_name.startswith(chapter_search) or
                chapter_search.startswith(chapter_name.split(':')[0])
            )
        ) or (
            topic_search and topic_search in chapter_name
        )
        
        # Search through topics in this chapter
        for topic in curr_chapter.get('topics', []):
            topic_name_field = topic.get('name', '').lower()
            
            # Check if topic matches
            topic_matches = (
                topic_search and topic_search in topic_name_field
            ) or (
                subtopic_search and (
                    subtopic_search in topic_name_field or
                    topic_name_field.startswith(subtopic_search)
                )
            ) or (
                chapter_matches and True  # If chapter matches, return first topic
            )
            
            if topic_matches:
                return {
                    'topic': topic,
                    'chapter': curr_chapter,
                    'grade': grade,
                    'curriculum_metadata': {
                        'book': curriculum.get('book', ''),
                        'grade_level': curriculum.get('grade_level', grade),
                        'curriculum': curriculum.get('curriculum', ''),
                    }
                }
    
    # No specific topic found, return general curriculum info
    return {
        'topic': None,
        'chapter': None,
        'grade': grade,
        'curriculum_metadata': {
            'book': curriculum.get('book', ''),
            'grade_level': curriculum.get('grade_level', grade),
            'curriculum': curriculum.get('curriculum', ''),
        }
    }

def build_curriculum_context(grade, topic_name=None, chapter=None, subtopic=None):
    """
    Build a formatted context string for AI prompts.
    
    Args:
        grade: Grade level (7 or 8)
        topic_name: Topic name
        chapter: Chapter name
        subtopic: Subtopic name
    
    Returns:
        str: Formatted curriculum context for AI prompts
    """
    result = find_topic_in_curriculum(grade, topic_name, chapter, subtopic)
    
    if not result or not result['topic']:
        # Return minimal context if topic not found
        return f"""CURRICULUM CONTEXT:
Grade {grade} Mathematics
Note: Specific topic not found in curriculum. Generate age-appropriate questions."""
    
    topic = result['topic']
    chapter_data = result['chapter']
    metadata = result['curriculum_metadata']
    
    # Build formatted context
    context_parts = [
        "CURRICULUM CONTEXT:",
        f"Textbook: {metadata.get('book', 'Unknown')}",
        f"Grade Level: {metadata.get('grade_level', grade)}",
        f"Chapter: {chapter_data.get('chapter', 'Unknown')}",
        f"Topic: {topic.get('name', 'Unknown')}",
        f"Book Pages: {topic.get('book1_pages', 'N/A')}",
        "",
        "LEARNING OBJECTIVES:",
    ]
    
    for obj in topic.get('learning_objectives', []):
        context_parts.append(f"  - {obj}")
    
    context_parts.append("")
    context_parts.append("KEY CONCEPTS:")
    for concept in topic.get('key_concepts', []):
        context_parts.append(f"  - {concept}")
    
    context_parts.append("")
    context_parts.append("TERMINOLOGY (use these exact terms):")
    for term in topic.get('terminology', []):
        context_parts.append(f"  - {term}")
    
    context_parts.append("")
    context_parts.append("SUBSKILLS TO TEST:")
    for skill in topic.get('subskills', []):
        context_parts.append(f"  - {skill}")
    
    example_problems = topic.get('example_problems', [])
    if example_problems:
        context_parts.append("")
        context_parts.append("EXAMPLE PROBLEM STYLES (match these formats):")
        for prob in example_problems[:3]:  # Limit to 3 examples
            context_parts.append(f"  - {prob}")
    
    common_mistakes = topic.get('common_mistakes', [])
    if common_mistakes:
        context_parts.append("")
        context_parts.append("COMMON MISTAKES (use as distractors in multiple choice):")
        for mistake in common_mistakes:
            context_parts.append(f"  - {mistake}")
    
    question_style = topic.get('question_style_notes', '')
    if question_style:
        context_parts.append("")
        context_parts.append("QUESTION STYLE GUIDANCE:")
        context_parts.append(f"  {question_style}")
    
    real_life_apps = topic.get('real_life_applications', [])
    if real_life_apps:
        context_parts.append("")
        context_parts.append("REAL-LIFE APPLICATIONS (for word problems):")
        for app in real_life_apps[:2]:  # Limit to 2
            context_parts.append(f"  - {app}")
    
    return "\n".join(context_parts)

def get_all_topics_for_grade(grade):
    """
    Get all topics for a grade level as a flat list.
    
    Args:
        grade: Grade level (7 or 8)
    
    Returns:
        list: List of topic dictionaries with chapter info
    """
    curriculum = get_curriculum_for_grade(grade)
    if not curriculum:
        return []
    
    topics = []
    for chapter in curriculum['chapters']:
        for topic in chapter.get('topics', []):
            topics.append({
                'chapter': chapter.get('chapter', ''),
                'topic': topic,
                'grade': grade
            })
    
    return topics

# Test function
if __name__ == '__main__':
    # Test loading Grade 7 curriculum
    print("Testing Grade 7 curriculum loader...")
    context = build_curriculum_context(7, "Divisibility", "Chapter 1")
    print(context)
    print("\n" + "="*80 + "\n")
    
    # Test loading Grade 8 curriculum
    print("Testing Grade 8 curriculum loader...")
    context = build_curriculum_context(8, "Negative numbers", "Chapter 1")
    print(context)
