import { useState, useRef, useCallback } from 'react';

const isProd = import.meta.env.PROD;
const API_URL = import.meta.env.VITE_API_URL || (isProd 
  ? 'https://voice-interview-agent-gh8x.onrender.com/api/interview' 
  : 'http://localhost:4000/api/interview');
const WS_URL = import.meta.env.VITE_WS_URL || (isProd 
  ? 'wss://voice-interview-agent-gh8x.onrender.com/ws' 
  : 'ws://localhost:4000/ws');

export function useVoiceSession() {
  const [status, setStatus] = useState('idle');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [language, setLanguage] = useState('en');
  const [transcript, setTranscript] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [questionIndex, setQuestionIndex] = useState(1);
  
  const wsRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef(null);  // Track current Audio element for immediate stop
  const stoppedRef = useRef(false);      // Flag to halt playback loop on end

  const playAudioChunk = useCallback(async (blob) => {
    // If the session was stopped, don't play
    if (stoppedRef.current) return;

    const mp3Blob = new Blob([blob], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(mp3Blob);
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    
    return new Promise((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        resolve();
      };
      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        resolve();
      });
    });
  }, []);

  /** Immediately stop all audio playback and clear the queue */
  const stopAllAudio = useCallback(() => {
    stoppedRef.current = true;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsAudioPlaying(false);
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback((sid) => {
    stoppedRef.current = false;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.binaryType = 'blob';

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', sessionId: sid }));
    };

    ws.onmessage = async (event) => {
      if (stoppedRef.current) return;

      if (event.data instanceof Blob) {
        audioQueueRef.current.push(event.data);
        if (!isPlayingRef.current) {
          isPlayingRef.current = true;
          setIsAudioPlaying(true);
          while (audioQueueRef.current.length > 0 && !stoppedRef.current) {
            const chunk = audioQueueRef.current.shift();
            await playAudioChunk(chunk);
          }
          isPlayingRef.current = false;
          setIsAudioPlaying(false);
        }
      } else {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status') {
          setStatus(msg.status);
        } else if (msg.type === 'transcript') {
          setTranscript((prev) => [...prev, { role: msg.role, text: msg.text }]);
        } else if (msg.type === 'question_update') {
          setQuestionIndex(msg.questionNumber);
        } else if (msg.type === 'completed') {
          setStatus('completed');
        } else if (msg.type === 'error') {
          setStatus('error');
          setErrorMsg(msg.message);
        }
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMsg('WebSocket connection error');
    };

    ws.onclose = () => {
      if (!stoppedRef.current) {
        setStatus('idle');
      }
    };
  }, [playAudioChunk]);

  const startSession = useCallback(async (lang = 'en', preCreatedSessionId = null) => {
    try {
      setStatus('connecting');
      setErrorMsg('');
      setLanguage(lang);
      setQuestionIndex(1);
      
      let sid = preCreatedSessionId;
      if (!sid) {
        const res = await fetch(`${API_URL}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: lang })
        });
        
        if (!res.ok) throw new Error('Failed to start session');
        
        const data = await res.json();
        sid = data.sessionId;
      }

      setSessionId(sid);
      connectWebSocket(sid);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message);
    }
  }, [connectWebSocket]);

  const sendAudio = useCallback((blob) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(blob);
    }
  }, []);

  const endSession = useCallback(async () => {
    // IMMEDIATELY stop all audio
    stopAllAudio();
    setStatus('analyzing'); // Show immediate UI feedback

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    let finalFeedback = null;
    if (sessionId) {
      try {
        const res = await fetch(`${API_URL}/${sessionId}/end`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          finalFeedback = data.feedback;
        }
      } catch (err) {
        console.error('Failed to fetch feedback', err);
      }
    }
    setStatus('idle');
    setSessionId(null);
    setTranscript([]);
    return finalFeedback;
  }, [sessionId, stopAllAudio]);

  const nextQuestion = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'next_question' }));
    }
  }, []);

  const sendControlMessage = useCallback((msgObj) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msgObj));
    }
  }, []);

  return {
    status,
    isAudioPlaying,
    sessionId,
    language,
    transcript,
    errorMsg,
    questionIndex,
    startSession,
    endSession,
    sendAudio,
    nextQuestion,
    sendControlMessage
  };
}
