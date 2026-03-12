import React, { useState, useEffect } from 'react';
import api from '../hooks/useApi';
import Button from './Button';

/**
 * Classroom Selector Component
 * Allows teachers to select one or more courses and choose topics for each
 *
 * @param {number} teacherId - Teacher's ID
 * @param {function} onSelect - Callback with shape:
 *   {
 *     courses: [courseId],
 *     selections: [{ course_id, topic_id, course_name }]
 *   }
 * @param {boolean} disabled - Disabled state
 */
export default function ClassroomSelector({ teacherId, onSelect, disabled = false }) {
  const [courses, setCourses] = useState([]);
  const [topicsByCourse, setTopicsByCourse] = useState({});
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState({});
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState({});
  const [error, setError] = useState('');
  const [showCreateTopic, setShowCreateTopic] = useState(null); // courseId or null
  const [newTopicName, setNewTopicName] = useState('');

  // Fetch courses when component mounts or teacherId changes
  useEffect(() => {
    if (teacherId) {
      fetchCourses();
    }
  }, [teacherId]);

  // Notify parent when selection changes
  useEffect(() => {
    const selections = selectedCourses.map((courseId) => {
      const course = courses.find((c) => c.id === courseId);
      return {
        course_id: courseId,
        topic_id: selectedTopics[courseId] || null,
        course_name: course?.name || '',
      };
    });
    onSelect({ courses: selectedCourses, selections });
  }, [selectedCourses, selectedTopics, courses]);

  const fetchCourses = async () => {
    setLoadingCourses(true);
    setError('');
    try {
      const response = await api.get(`/api/classroom/courses`, { params: { teacher_id: teacherId } });
      setCourses(response.data.courses || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoadingCourses(false);
    }
  };

  const fetchTopics = async (courseId) => {
    setLoadingTopics((prev) => ({ ...prev, [courseId]: true }));
    try {
      const response = await api.get(`/api/classroom/courses/${courseId}/topics`, { params: { teacher_id: teacherId } });
      setTopicsByCourse((prev) => ({ ...prev, [courseId]: response.data.topics || [] }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load topics for this course');
      setTopicsByCourse((prev) => ({ ...prev, [courseId]: [] }));
    }
    setLoadingTopics((prev) => ({ ...prev, [courseId]: false }));
  };

  const handleCourseToggle = (courseId) => {
    setSelectedCourses((prev) => {
      if (prev.includes(courseId)) {
        const next = prev.filter((c) => c !== courseId);
        // drop topic selection for removed course
        setSelectedTopics((topics) => {
          const t = { ...topics };
          delete t[courseId];
          return t;
        });
        return next;
      }
      // newly added course: fetch topics
      fetchTopics(courseId);
      return [...prev, courseId];
    });
  };

  const handleCreateTopic = async (courseId) => {
    if (!newTopicName.trim()) return;

    setLoadingTopics((prev) => ({ ...prev, [courseId]: true }));
    try {
      const response = await api.post(`/api/classroom/courses/${courseId}/topics`, {
        teacher_id: teacherId,
        name: newTopicName.trim(),
      });

      setTopicsByCourse((prev) => ({
        ...prev,
        [courseId]: [...(prev[courseId] || []), response.data],
      }));
      setSelectedTopics((prev) => ({ ...prev, [courseId]: response.data.id }));
      setShowCreateTopic(null);
      setNewTopicName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create topic');
    } finally {
      setLoadingTopics((prev) => ({ ...prev, [courseId]: false }));
    }
  };

  if (!teacherId) {
    return (
      <div className="p-4 bg-paper rounded-xl border border-border">
        <p className="text-muted text-sm">Teacher ID required</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-wrong/10 border border-wrong rounded-lg text-wrong text-sm">
          {error}
          <button
            onClick={fetchCourses}
            className="ml-2 underline hover:text-wrong/80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Course Selection */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">
          Google Classroom Courses (select one or more)
        </label>
        {loadingCourses && !courses.length ? (
          <div className="text-muted text-sm">Loading courses...</div>
        ) : courses.length === 0 ? (
          <div className="text-muted text-sm">
            No courses found. Make sure you're connected to Google Classroom.
            <button
              onClick={fetchCourses}
              className="ml-2 text-accent hover:underline"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-xl p-3">
            {courses.map((course) => (
              <label
                key={course.id}
                className="flex items-center gap-3 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedCourses.includes(course.id)}
                  onChange={() => handleCourseToggle(course.id)}
                  disabled={disabled || loadingCourses}
                />
                <span>{course.name} {course.section ? `(${course.section})` : ''}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Topic Selection per course */}
      {selectedCourses.map((courseId) => {
        const course = courses.find((c) => c.id === courseId);
        const topics = topicsByCourse[courseId] || [];
        const loading = loadingTopics[courseId];

        return (
          <div key={courseId} className="p-3 border border-border rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">
                Topic for {course?.name || 'Course'}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchTopics(courseId)}
                disabled={disabled || loading}
              >
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="text-muted text-sm">Loading topics...</div>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedTopics[courseId] || ''}
                  onChange={(e) => setSelectedTopics((prev) => ({ ...prev, [courseId]: e.target.value }))}
                  disabled={disabled}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent2"
                >
                  <option value="">No topic (main stream)</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateTopic(courseId)}
                  disabled={disabled || loading}
                >
                  + Create new topic
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Create Topic Modal */}
      {showCreateTopic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-ink mb-4">Create New Topic</h3>
            <input
              type="text"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder="Enter topic name..."
              className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent2 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={() => handleCreateTopic(showCreateTopic)}
                disabled={loadingTopics[showCreateTopic] || !newTopicName.trim()}
                fullWidth
              >
                {loadingTopics[showCreateTopic] ? 'Creating...' : 'Create Topic'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateTopic(null);
                  setNewTopicName('');
                }}
                disabled={loadingTopics[showCreateTopic]}
                fullWidth
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
