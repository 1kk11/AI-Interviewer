import { useEffect, useRef } from 'react';
import './TranscriptPanel.css';

export default function TranscriptPanel({ transcript }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="transcript-panel" ref={scrollRef}>
      {transcript.length === 0 ? (
        <div className="transcript-empty">
          Connecting to AI Interviewer...
        </div>
      ) : (
        transcript.map((msg, index) => (
          <div key={index} className={`message-bubble ${msg.role}`}>
            <div className="message-label">{msg.role === 'ai' ? 'Interviewer' : 'You'}</div>
            <div className="message-text">{msg.text}</div>
          </div>
        ))
      )}
    </div>
  );
}
