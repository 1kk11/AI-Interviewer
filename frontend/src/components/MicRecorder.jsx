import { useState, useRef, useEffect, useCallback } from 'react';
import './MicRecorder.css';

export default function MicRecorder({ onAudioReady, disabled, status }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    // Request microphone access up front
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream;
      })
      .catch(err => {
        console.error('Microphone access denied:', err);
      });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (disabled || !streamRef.current) return;
    
    audioChunksRef.current = [];
    
    // Try to use webm/opus, fallback to default
    let options = { mimeType: 'audio/webm;codecs=opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = {}; // use browser default
    }

    const recorder = new MediaRecorder(streamRef.current, options);
    
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    
    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
      onAudioReady(audioBlob);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, [disabled, onAudioReady]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const getStatusText = () => {
    if (isRecording) return 'Listening...';
    if (status === 'transcribing') return 'Transcribing...';
    if (status === 'thinking') return 'Thinking...';
    if (status === 'speaking') return 'AI Speaking...';
    return 'Hold to Talk';
  };

  return (
    <div className="mic-container">
      <button 
        className={`mic-button ${isRecording ? 'recording' : ''} ${status !== 'ready' && !isRecording ? 'busy' : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={stopRecording}
        onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
        onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
        disabled={disabled}
      >
        <div className="mic-icon">🎙️</div>
      </button>
      <div className="mic-status">{getStatusText()}</div>
    </div>
  );
}
