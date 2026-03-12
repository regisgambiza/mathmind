import React, { useState, useEffect } from 'react';
import api from '../hooks/useApi';
import Button from './Button';

/**
 * Classroom Selector Component
 * Allows teachers to select a course and topic for quiz posting
 *
 * @param {number} teacherId - Teacher's ID
 * @param {function} onSelect - Callback with { course_id, topic_id, course_name }
 * @param {boolean} disabled - Disabled state
 */
export default function ClassroomSelector({ teacherId, onSelect, disabled = false }) {
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  // Fetch courses when component mounts or teacherId changes
  useEffect(() => {
    if (teacherId) {
      fetchCourses();
    }
  }, [teacherId]);

  // Fetch topics when course is selected
  useEffect(() => {
    if (selectedCourse) {
      fetchTopics();
    } else {
      setTopics([]);
      setSelectedTopic('');
    }
  }, [selectedCourse]);

  // Notify parent when selection changes
  useEffect(() => {
    if (selectedCourse) {
      const course = courses.find(c => c.id === selectedCourse);
      onSelect({
        course_id: selectedCourse,
        topic_id: selectedTopic || null,
        course_name: course?.name || '',
      });
    }
  }, [selectedCourse, selectedTopic, courses]);

  const fetchCourses = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/classroom/courses`, { params: { teacher_id: teacherId } });
      setCourses(response.data.courses || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopics = async () => {
    try {
      const response = await api.get(`/api/classroom/courses/${selectedCourse}/topics`, { params: { teacher_id: teacherId } });
      setTopics(response.data.topics || []);
    } catch (err) {
      setTopics([]);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;

    setLoading(true);
    try {
      const response = await api.post(`/api/classroom/courses/${selectedCourse}/topics`, {
        teacher_id: teacherId,
        name: newTopicName.trim(),
      });

      setTopics([...topics, response.data]);
      setSelectedTopic(response.data.id);
      setShowCreateTopic(false);
      setNewTopicName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create topic');
    } finally {
      setLoading(false);
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
          Google Classroom Course
        </label>
        {loading && !courses.length ? (
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
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            disabled={disabled || loading}
            className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent2"
          >
            <option value="">Select a course...</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} {course.section ? `(${course.section})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Topic Selection */}
      {selectedCourse && (
        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Topic (Optional)
          </label>
          {topics.length === 0 ? (
            <div className="space-y-2">
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={disabled || loading}
                className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent2"
              >
                <option value="">No topic (main stream)</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateTopic(true)}
                disabled={disabled || loading}
              >
                + Create new topic
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={disabled || loading}
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
                onClick={() => setShowCreateTopic(true)}
                disabled={disabled || loading}
              >
                + Create new topic
              </Button>
            </div>
          )}
        </div>
      )}

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
                onClick={handleCreateTopic}
                disabled={loading || !newTopicName.trim()}
                fullWidth
              >
                {loading ? 'Creating...' : 'Create Topic'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateTopic(false);
                  setNewTopicName('');
                }}
                disabled={loading}
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
