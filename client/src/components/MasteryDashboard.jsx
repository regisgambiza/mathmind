import React, { useMemo } from 'react';
import { CATEGORY_COLORS, CATEGORY_LABELS, getSkillCategory, suggestReviewTopics } from '../utils/skillPrerequisites';

const MASTERY_COLORS = {
  needs_work: 'bg-red-500',
  developing: 'bg-yellow-500',
  strong: 'bg-green-500',
  excellent: 'bg-emerald-500',
};

const STATUS_LABELS = {
  needs_work: 'Needs Work',
  developing: 'Developing',
  strong: 'Strong',
  excellent: 'Excellent',
};

function MasteryBar({ mastery, size = 'md' }) {
  const height = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-3';
  const color = mastery >= 80 ? 'bg-green-500' : mastery >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className={`w-full ${height} bg-paper rounded-full overflow-hidden border border-border`}>
      <div
        className={`h-full ${color} transition-all duration-500`}
        style={{ width: `${Math.max(5, mastery)}%` }}
      />
    </div>
  );
}

function SkillNode({ skill, mastery, onClick, isSelected }) {
  const category = getSkillCategory(skill);
  const status = mastery >= 80 ? 'excellent' : mastery >= 60 ? 'strong' : mastery >= 40 ? 'developing' : 'needs_work';
  
  return (
    <button
      onClick={() => onClick(skill)}
      className={`p-3 rounded-xl border-2 transition-all text-left ${
        isSelected 
          ? 'border-accent2 bg-accent2/10 shadow-lg scale-105' 
          : 'border-border bg-card hover:border-accent/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${CATEGORY_COLORS[category] || 'bg-gray-500'}`} />
        <span className="font-syne font-700 text-sm text-ink truncate">{skill}</span>
      </div>
      <MasteryBar mastery={mastery} size="sm" />
      <div className="flex items-center justify-between mt-2">
        <span className="font-dm text-xs text-muted">{STATUS_LABELS[status]}</span>
        <span className="font-syne font-800 text-xs text-ink">{mastery}%</span>
      </div>
    </button>
  );
}

function SkillHeatmap({ masteryData, onSkillClick, selectedSkill }) {
  const skillsByCategory = useMemo(() => {
    const grouped = {};
    masteryData.forEach((item) => {
      const category = getSkillCategory(item.topic);
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    });
    return grouped;
  }, [masteryData]);

  return (
    <div className="space-y-6">
      {Object.entries(skillsByCategory).map(([category, skills]) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-4 h-4 rounded ${CATEGORY_COLORS[category] || 'bg-gray-500'}`} />
            <h3 className="font-syne font-700 text-base text-ink">{CATEGORY_LABELS[category] || category}</h3>
            <span className="font-dm text-xs text-muted">({skills.length} skills)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {skills.map((skill) => (
              <SkillNode
                key={skill.topic}
                skill={skill.topic}
                mastery={skill.avg_pct}
                onClick={onSkillClick}
                isSelected={selectedSkill === skill.topic}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressChart({ weeklyTrend }) {
  const maxScore = Math.max(...weeklyTrend.map((w) => w.avg_score || 0), 100);
  
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-syne font-700 text-lg text-ink mb-4">Progress Over Time</h3>
      {weeklyTrend.length === 0 ? (
        <p className="font-dm text-sm text-muted">Complete quizzes to see your progress.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2 h-32">
            {weeklyTrend.map((week) => {
              const height = ((week.avg_score || 0) / maxScore) * 100;
              return (
                <div key={week.week_start} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full relative">
                    <div
                      className="w-full bg-accent2/30 rounded-t transition-all duration-500 hover:bg-accent2/50"
                      style={{ height: `${Math.max(4, height)}%`, minHeight: '4px' }}
                    />
                    {week.avg_score >= 80 && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs">🌟</div>
                    )}
                  </div>
                  <span className="font-dm text-[10px] text-muted -rotate-45 origin-top-left">
                    {new Date(week.week_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="font-dm text-xs text-muted">Average Score</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-accent2" />
                <span className="font-dm text-xs text-muted">Quiz Avg</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewSuggestions({ masteryData, onSuggestionClick }) {
  const weakSkills = useMemo(() => {
    return masteryData
      .filter((s) => s.avg_pct < 60)
      .sort((a, b) => a.avg_pct - b.avg_pct)
      .slice(0, 5);
  }, [masteryData]);

  const suggestions = useMemo(() => {
    const weakSkillNames = weakSkills.map((s) => s.topic);
    return suggestReviewTopics(weakSkillNames);
  }, [weakSkills]);

  if (suggestions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-syne font-700 text-lg text-ink mb-2">🎉 Great Job!</h3>
        <p className="font-dm text-sm text-muted">All your skills are developing well. Keep practicing to maintain your progress!</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-syne font-700 text-lg text-ink mb-2">📚 Recommended Review</h3>
      <p className="font-dm text-sm text-muted mb-4">
        Based on your performance, reviewing these topics will help you improve:
      </p>
      <div className="space-y-2">
        {suggestions.slice(0, 5).map((suggestion, idx) => (
          <button
            key={`${suggestion.skill}-${idx}`}
            onClick={() => onSuggestionClick(suggestion)}
            className="w-full p-3 rounded-xl border border-border bg-paper hover:border-accent2 transition-all text-left flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[suggestion.category] || 'bg-gray-500'}`} />
              <div>
                <p className="font-syne font-700 text-sm text-ink group-hover:text-accent2 transition-colors">
                  {suggestion.skill}
                </p>
                <p className="font-dm text-xs text-muted">
                  Needed for: {suggestion.becauseOf}
                </p>
              </div>
            </div>
            <span className="font-dm text-xs text-accent2 font-700">Review →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillDetailModal({ skill, mastery, onClose }) {
  if (!skill) return null;

  const category = getSkillCategory(skill);
  const status = mastery >= 80 ? 'excellent' : mastery >= 60 ? 'strong' : mastery >= 40 ? 'developing' : 'needs_work';

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-5">
      <div className="bg-card rounded-2xl p-6 max-w-md w-full animate-fadeUp border-2 border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${CATEGORY_COLORS[category] || 'bg-gray-500'}`} />
            <h2 className="font-syne font-700 text-xl text-ink">{skill}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-paper rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="font-dm text-xs text-muted uppercase tracking-wider mb-2">Mastery Level</p>
            <div className="flex items-center gap-3">
              <MasteryBar mastery={mastery} size="lg" />
              <span className="font-syne font-800 text-2xl text-ink w-16 text-right">{mastery}%</span>
            </div>
            <p className={`font-dm text-sm mt-2 ${
              status === 'excellent' ? 'text-green-600' :
              status === 'strong' ? 'text-accent2' :
              status === 'developing' ? 'text-yellow-600' : 'text-wrong'
            }`}>
              {STATUS_LABELS[status]}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-paper border border-border">
            <p className="font-syne font-700 text-sm text-ink mb-2">💡 Tips for Improvement</p>
            <ul className="space-y-1">
              {mastery < 40 && (
                <li className="font-dm text-xs text-muted">• Start with foundation-level practice questions</li>
              )}
              {mastery >= 40 && mastery < 60 && (
                <li className="font-dm text-xs text-muted">• Focus on understanding the core concepts</li>
              )}
              {mastery >= 60 && mastery < 80 && (
                <li className="font-dm text-xs text-muted">• Practice more challenging problems to build fluency</li>
              )}
              {mastery >= 80 && (
                <li className="font-dm text-xs text-muted">• Try advanced problems or help peers learn</li>
              )}
              <li className="font-dm text-xs text-muted">• Review mistakes carefully to understand errors</li>
              <li className="font-dm text-xs text-muted">• Ask for hints when stuck on problems</li>
            </ul>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl bg-ink text-paper font-syne font-700 text-sm hover:bg-ink/90 transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export { 
  SkillHeatmap, 
  ProgressChart, 
  ReviewSuggestions, 
  SkillDetailModal,
  MASTERY_COLORS,
  STATUS_LABELS,
};
