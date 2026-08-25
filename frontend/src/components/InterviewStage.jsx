import { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceSession } from '../hooks/useVoiceSession.js';
import './InterviewStage.css';

export default function InterviewStage({ language, sessionId, onEnd }) {
  const {
    status,
    isAudioPlaying,
    transcript,
    errorMsg,
    questionIndex,
    startSession,
    endSession,
    sendAudio,
    nextQuestion,
    sendControlMessage
  } = useVoiceSession();

  const startedRef = useRef(false);
  const videoRef = useRef(null);
  const scrollRef = useRef(null);
  const aiVideoRef = useRef(null);

  // Mic recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  
  // Local UI state for bottom controls
  const [captionsOn, setCaptionsOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);

  // Recording state
  const [recordDuration, setRecordDuration] = useState(0);
  const timerRef = useRef(null);

  // Active Interview Time state (10 mins limit = 600s)
  const [activeDuration, setActiveDuration] = useState(0);
  const [timeUpSent, setTimeUpSent] = useState(false);
  
  // Tick active time when status is 'ready' or 'speaking'
  useEffect(() => {
    let interval = null;
    if (status === 'ready' || status === 'speaking') {
      interval = setInterval(() => {
        setActiveDuration(prev => {
          const newTime = prev + 1;
          if (newTime >= 600 && !timeUpSent) {
            console.log('[Timer] 10 minutes reached! Initiating soft stop...');
            sendControlMessage({ type: 'time_up' });
            setTimeUpSent(true);
          }
          return newTime;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, timeUpSent, sendControlMessage]);

  // AI Avatar Video Control
  const rewindIntervalRef = useRef(null);
  
  const isAgentSpeaking = status === 'speaking' || isAudioPlaying;

  useEffect(() => {
    if (aiVideoRef.current) {
      if (isAgentSpeaking) {
        // Clear any rewinding logic
        if (rewindIntervalRef.current) {
          clearInterval(rewindIntervalRef.current);
          rewindIntervalRef.current = null;
        }
        aiVideoRef.current.play().catch(e => console.log('[AI Avatar] Play error:', e));
      } else {
        // AI stopped speaking: rewind back to frame 0 smoothly
        aiVideoRef.current.pause();
        
        if (!rewindIntervalRef.current) {
          rewindIntervalRef.current = setInterval(() => {
            if (aiVideoRef.current) {
              if (aiVideoRef.current.currentTime <= 0.1) {
                // Reached the start (Planet state)
                aiVideoRef.current.currentTime = 0;
                clearInterval(rewindIntervalRef.current);
                rewindIntervalRef.current = null;
              } else {
                // Rewind by 0.1s every 40ms (~2.5x speed reverse)
                aiVideoRef.current.currentTime -= 0.1;
              }
            }
          }, 40);
        }
      }
    }
  }, [isAgentSpeaking]);

  // Active question text
  const activeQuestionText = transcript.slice().reverse().find(m => m.role === 'ai')?.text 
    || "Connecting to your interviewer...";

  // Latest candidate speech for caption overlay
  const latestCandidateSpeech = transcript.slice().reverse().find(m => m.role === 'user')?.text
    || (isRecording ? "Listening to your response..." : "Click mic button to speak...");

  // Caption overlay refs for live auto-scrolling
  const aiCaptionRef = useRef(null);
  const userCaptionRef = useRef(null);
  const aiAnchorRef = useRef(null);
  const userAnchorRef = useRef(null);

  // Auto-scroll AI caption overlay to keep latest lines in view
  useEffect(() => {
    console.log('[Caption Scroll AI] Question text updated, auto-scrolling:', activeQuestionText.slice(0, 40));
    const timer = setTimeout(() => {
      if (aiCaptionRef.current) {
        aiCaptionRef.current.scrollTop = aiCaptionRef.current.scrollHeight;
        aiCaptionRef.current.scrollTo({
          top: aiCaptionRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
      if (aiAnchorRef.current) {
        aiAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [activeQuestionText]);

  // Auto-scroll candidate caption overlay to keep latest lines in view
  useEffect(() => {
    console.log('[Caption Scroll User] Candidate transcript updated, auto-scrolling:', latestCandidateSpeech.slice(0, 40));
    const timer = setTimeout(() => {
      if (userCaptionRef.current) {
        userCaptionRef.current.scrollTop = userCaptionRef.current.scrollHeight;
        userCaptionRef.current.scrollTo({
          top: userCaptionRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
      if (userAnchorRef.current) {
        userAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [latestCandidateSpeech]);

  // Start session & camera
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startSession(language, sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safely attach stream to video DOM element
  const attachStream = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(e => console.log('[Camera] Auto-play info:', e.message));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        attachStream();
      })
      .catch((err) => {
        console.warn('[Camera] Video+Audio failed, falling back to Audio-only:', err);
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            if (cancelled) {
              stream.getTracks().forEach(t => t.stop());
              return;
            }
            streamRef.current = stream;
          })
          .catch(e => console.error('[Camera] MediaDevices failed:', e));
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [attachStream]);

  // Re-attach stream whenever cameraOn state changes
  useEffect(() => {
    if (cameraOn) {
      attachStream();
    }
  }, [cameraOn, attachStream]);

  // Callback ref for <video> element mounting
  const setVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  // Auto-scroll transcript if visible
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, status]);

  const handleNextQuestion = useCallback(() => {
    nextQuestion();
  }, [nextQuestion]);

  // Mic recording handlers
  const startRecording = useCallback(() => {
    if (status !== 'ready' || !streamRef.current || isRecording) return;

    audioChunksRef.current = [];
    let options = { mimeType: 'audio/webm;codecs=opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {};

    const audioTracks = streamRef.current.getAudioTracks();
    audioTracks.forEach(t => { t.enabled = true; });
    const audioStream = new MediaStream(audioTracks);

    const recorder = new MediaRecorder(audioStream, options);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size > 0) {
        console.log(`[Mic] Submitting complete answer blob (${blob.size} bytes)...`);
        sendAudio(blob);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250);
    setIsRecording(true);
    
    // Start timer
    setRecordDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordDuration(prev => prev + 1);
    }, 1000);
  }, [status, isRecording, sendAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Safety: If status leaves 'ready' (e.g. AI is speaking or transcribing), ensure recording is stopped
  useEffect(() => {
    if (status !== 'ready' && isRecording) {
      stopRecording();
    }
  }, [status, isRecording, stopRecording]);

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach(t => { t.enabled = !cameraOn; });
    }
    setCameraOn(prev => !prev);
  };

  const handleEnd = useCallback(async () => {
    const feedback = await endSession();
    onEnd(feedback);
  }, [endSession, onEnd]);

  // Auto-end interview when status becomes 'completed' and AI has finished speaking
  useEffect(() => {
    if (status === 'completed' && !isAudioPlaying) {
      const t = setTimeout(() => {
        handleEnd();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [status, isAudioPlaying, handleEnd]);

  // Format duration as mm:ss
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (status === 'error') {
    return (
      <div className="call-error-panel card">
        <div className="error-icon">⚠️</div>
        <h2>Connection Error</h2>
        <div className="error-msg">{errorMsg}</div>
        <button className="btn btn-primary" onClick={handleEnd}>Return to Lobby</button>
      </div>
    );
  }

  const isBusy = status !== 'ready' && !isRecording;

  return (
    <div className="call-screen-container">
      {/* ── Call Header ── */}
      <header className="call-header">
        {/* Brand Group: Mic Icon + Title & Live Status */}
        <div className="header-brand-wrap">
          <div className="header-mic-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
          </div>
          <div className="header-title-group">
            <h1 className="header-title">Voice Interview Agent</h1>
            <div className="header-status-sub">
              <span>Interview in progress</span>
            </div>
          </div>
        </div>

        {/* Action Controls: Timer + End Button */}
        <div className="header-actions-wrap">
          <div 
            className={`call-timer-pill ${activeDuration >= 540 ? 'time-warning' : ''}`}
            style={activeDuration >= 540 ? { color: '#ef4444', borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' } : {}}
            title="Interview Timer (10 minutes total)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>{formatTime(activeDuration)} / 10:00</span>
          </div>

          <button className="call-end-pill-btn" onClick={handleEnd} title="End Interview">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(135deg)' }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            <span>End Interview</span>
          </button>
        </div>
      </header>

      {/* ── Main Content: Two Side-by-Side Video Panels ── */}
      <main className="call-main-grid">
        {/* Left Panel: AI Interviewer */}
        <div className={`video-panel ai-panel ${isAgentSpeaking ? 'is-speaking' : ''}`}>
          <video 
            ref={aiVideoRef}
            src="/sample_motion_graphic_animation.mp4" 
            className="video-feed-img ai-avatar-video"
            loop
            muted
            playsInline
            style={{ objectFit: 'contain', width: '100%', height: '100%', backgroundColor: '#000' }}
          />
          
          {/* Top-Left Overlay Tag */}
          <div className="panel-tag ai-tag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10v3M6 6v11M10 3v17M14 8v7M18 5v13M22 10v3" />
            </svg>
            <span>AI INTERVIEWER</span>
          </div>

          {/* Top-Right Icon Badge */}
          <div className="panel-badge-tr">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10v3M6 6v11M10 3v17M14 8v7M18 5v13M22 10v3" />
            </svg>
          </div>

          {/* Bottom Gradient Overlay: Question Caption */}
          <div className="panel-bottom-overlay">
            <div className="panel-overlay-label teal-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10v3M6 6v11M10 3v17M14 8v7M18 5v13M22 10v3" />
              </svg>
              <span>AI INTERVIEWER</span>
            </div>
            {captionsOn && (
              <div className="panel-caption-box">
                <div ref={aiCaptionRef} className="panel-caption-scroll">
                  <div className="panel-caption-content">
                    {activeQuestionText}
                  </div>
                  <div ref={aiAnchorRef} className="caption-bottom-anchor" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Candidate (You) */}
        <div className={`video-panel user-panel ${isRecording ? 'is-speaking' : ''}`}>
          {cameraOn ? (
            <video
              ref={setVideoRef}
              autoPlay
              muted
              playsInline
              className="video-feed-element"
            />
          ) : (
            <div className="camera-off-placeholder">
              <div className="candidate-avatar-large">C</div>
              <span>Camera Off</span>
            </div>
          )}

          {/* Top-Left Overlay Tag */}
          <div className="panel-tag user-tag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>YOU</span>
          </div>

          {/* Top-Right Icon Badge */}
          <div className="panel-badge-tr">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10v3M6 6v11M10 3v17M14 8v7M18 5v13M22 10v3" />
            </svg>
          </div>

          {/* Bottom Gradient Overlay: Speech Caption */}
          <div className="panel-bottom-overlay">
            <div className="panel-overlay-label teal-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10v3M6 6v11M10 3v17M14 8v7M18 5v13M22 10v3" />
              </svg>
              <span>YOU</span>
            </div>
            {captionsOn && (
              <div className="panel-caption-box">
                <div ref={userCaptionRef} className="panel-caption-scroll">
                  <div className="panel-caption-content">
                    {latestCandidateSpeech}
                  </div>
                  <div ref={userAnchorRef} className="caption-bottom-anchor" />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Bottom Control Bar: 5 items centered in a row ── */}
      <footer className="call-control-bar">
        {/* 1. Captions Button */}
        <button
          className={`control-box ${captionsOn ? 'active' : ''}`}
          onClick={() => setCaptionsOn(!captionsOn)}
          title="Toggle Captions"
        >
          <div className="control-icon-badge teal-badge">
            <span>CC</span>
          </div>
          <div className="control-label-group">
            <span className="control-title">Captions</span>
            <span className="control-status">{captionsOn ? 'On' : 'Off'}</span>
          </div>
        </button>

        {/* 2. Settings Button */}
        <button
          className="control-box"
          onClick={() => alert('Settings menu coming soon!')}
          title="Settings"
        >
          <div className="control-icon-badge dark-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </div>
          <div className="control-label-group">
            <span className="control-title">Settings</span>
            <span className="control-status">Default</span>
          </div>
        </button>

        {/* 3. Center: Prominent Circular Mic Button */}
        <div className={`center-mic-wrap ${isRecording ? 'is-recording' : ''}`}>
          <button
            className={`center-mic-btn ${isRecording ? 'recording' : 'active'}`}
            onClick={() => isRecording ? stopRecording() : startRecording()}
            disabled={status !== 'ready'}
            aria-label={isRecording ? 'Stop & send response' : 'Click to speak'}
            title={isRecording ? 'Stop & send response' : 'Click to speak'}
          >
            {isRecording ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="3"></rect>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
            )}
          </button>
          <div className="mic-glowing-ring" />
        </div>

        {/* 4. Camera Button */}
        <button
          className="control-box"
          onClick={toggleCamera}
          title="Toggle Camera"
        >
          <div className={`control-icon-badge ${cameraOn ? 'dark-badge' : 'danger-badge'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </div>
          <div className="control-label-group">
            <span className="control-title">Camera</span>
            <span className="control-status">{cameraOn ? 'On' : 'Off'}</span>
          </div>
        </button>

        {/* 5. Speaker Button */}
        <button
          className="control-box"
          onClick={() => setSpeakerOn(!speakerOn)}
          title="Toggle Speaker"
        >
          <div className={`control-icon-badge ${speakerOn ? 'dark-badge' : 'danger-badge'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </div>
          <div className="control-label-group">
            <span className="control-title">Speaker</span>
            <span className="control-status">{speakerOn ? 'On' : 'Off'}</span>
          </div>
        </button>
      </footer>
    </div>
  );
}
