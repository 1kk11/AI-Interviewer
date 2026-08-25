import { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen.jsx';
import InterviewStage from './components/InterviewStage.jsx';
import FeedbackReport from './components/FeedbackReport.jsx';
import './App.css';

function App() {
  const [stage, setStage] = useState('setup'); // setup | interview | feedback
  const [language, setLanguage] = useState('en');
  const [sessionId, setSessionId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // ── Theme ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const isDark = theme === 'dark';
  // ──────────────────────────────────────────────────────────────────

  const handleEndInterview = (finalFeedback) => {
    setFeedback(finalFeedback);
    setStage('feedback');
  };

  const handleRestart = () => {
    setFeedback(null);
    setSessionId(null);
    setStage('setup');
  };

  const handleStartSession = (sessionData) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      ctx.resume();
    }
    if (sessionData && sessionData.sessionId) {
      setSessionId(sessionData.sessionId);
    }
    if (sessionData && sessionData.language) {
      setLanguage(sessionData.language);
    }
    setStage('interview');
  };

  return (
    <div className={`app ${stage === 'interview' ? 'in-interview' : ''}`}>
      {/* Top Bar — rendered for setup and feedback stages */}
      {stage !== 'interview' && (
        <header className="topbar">
          <div className="topbar-brand">
            <div className="topbar-logo">AI</div>
            <div>
              <div className="topbar-title">InterviewAI</div>
              <div className="topbar-subtitle">Voice Interview Platform</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-badge">
              <div className="topbar-badge-dot" />
              Live Session
            </div>

            {/* Theme Toggle */}
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <div className="theme-toggle-track">
                <span className="theme-toggle-icon">🌙</span>
                <span className="theme-toggle-icon">☀️</span>
              </div>
              <div className="theme-toggle-knob" />
            </button>

            <div className="candidate-profile">
              <div className="candidate-avatar">C</div>
              Candidate
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`app-main ${stage === 'interview' ? 'interview-main' : ''}`}>
        {stage === 'setup' && (
          <SetupScreen
            onStartSession={handleStartSession}
            language={language}
            onLanguageChange={setLanguage}
          />
        )}

        {stage === 'interview' && (
          <InterviewStage
            language={language}
            sessionId={sessionId}
            onEnd={handleEndInterview}
          />
        )}

        {stage === 'feedback' && (
          <FeedbackReport feedback={feedback} onRestart={handleRestart} />
        )}
      </main>
    </div>
  );
}

export default App;
