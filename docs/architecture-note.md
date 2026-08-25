# Architecture Note

## 1. Retrieval Design: Storage, Chunking, and Matching

**Storage and Chunking**
The reference Q&A dataset is stored in Pinecone, a vector database. To ensure high-quality contextual retrieval, the dataset is chunked structurally rather than by arbitrary token counts. Each question in the dataset is split into three distinct chunks:
- `question`: The text of the question itself.
- `ideal_answer`: A comprehensive example of a perfect answer.
- `rubric`: Keyphrases and a follow-up hint to evaluate the candidate's response.
These chunks are enriched with metadata (category, difficulty, language, and question ID).

**Matching Approach**
We implemented a dual-path retrieval strategy:
1. **Deterministic Fetch (Primary):** During the interview flow, the system tracks which question the user is currently answering (e.g., `q01`). We bypass semantic search and use Pinecone's direct ID fetch to pull the exact `question`, `ideal_answer`, and `rubric` chunks for the current topic. This guarantees 100% accuracy for the interview context.
2. **Semantic Search (Fallback):** If a candidate provides a highly tangential answer, we can embed their response and perform a semantic query against all `ideal_answer` and `rubric` chunks in the database to see if they accidentally answered a different question or hit another rubric.

**Why this approach?**
A purely semantic approach (embedding the user's transcript and pulling the nearest neighbor) is dangerous in a structured interview. If the user answers poorly, the semantic search might pull an unrelated question's rubric, confusing the LLM. The deterministic fetch anchors the LLM strictly to the current topic, while structural chunking ensures the LLM receives clean, categorized context rather than a muddy block of text.

## 2. Controlling LLM Behavior (The Interviewer Persona)

Keeping the LLM behaving like an interviewer rather than an encyclopedic chatbot was achieved through strict system prompting and architectural constraints:

- **Grounding without Leaking:** The system prompt explicitly injects the `CURRENT TOPIC`, `IDEAL ANSWER`, and `KEY RUBRIC PHRASES` retrieved from Pinecone. However, it contains a hard negative constraint: *"NEVER read back the ideal answer or rubric. Act like a human having a conversation."* This forces the LLM to use the context strictly for *evaluation*, not for recitation.
- **Managing Follow-ups:** The prompt instructs the LLM: *"If the user's answer is missing key ideal points, ask a natural follow-up question to dig deeper."* The LLM is also provided a specific `FOLLOW-UP HINT` from the database to guide the candidate gently if they are completely stuck, ensuring the AI doesn't hallucinate irrelevant technical hints.
- **Staying on Track and Progression:** To prevent the AI from getting stuck on a single topic, we designed a hidden command architecture. We inject the *next* question's topic into the prompt. The LLM is instructed: *"If the candidate has sufficiently answered the current topic... IMMEDIATELY ask the NEXT TOPIC. If you do this, you MUST append the exact string '[NEXT_QUESTION]' at the very end of your response."* The backend orchestrator intercepts this token, strips it from the final audio, and automatically increments the session's question state.

## 3. Latency Optimization: Where Time is Spent

Voice agents must feel responsive to maintain a natural conversational flow. In our pipeline, latency is distributed across three main phases:

1. **Speech-to-Text (STT):** We use Groq's Whisper API. Because we use a "Hold-to-Talk" mechanism, STT cannot begin until the user releases the button and the audio Blob is uploaded.
2. **LLM Inference:** We use `llama-3.3-70b-versatile` via Groq. The prompt is large (containing the system instructions and full conversation history).
3. **Text-to-Speech (TTS):** We use ElevenLabs for high-quality voice synthesis.

**Current Optimizations:**
- **TTS Streaming:** Instead of waiting for ElevenLabs to generate the entire audio file, we pipe the `ReadableStream` directly from the API through our WebSocket to the client. The browser begins playing the binary chunks immediately, drastically reducing Time-to-First-Byte (TTFB).
- **LPU Inference:** Groq's Language Processing Units process the LLM inference much faster than traditional GPUs, minimizing phase 2 latency.

**How we would reduce it further:**
1. **Continuous Voice Activity Detection (VAD):** Instead of Hold-to-Talk, implementing client-side VAD (WebRTC) would allow us to stream audio chunks continuously. STT could transcribe in real-time, completely eliminating the upload delay at the end of the user's speech.
2. **LLM Token Streaming:** Currently, we wait for the LLM to generate its *full* text response before sending it to ElevenLabs. By enabling LLM streaming, we could send the response to ElevenLabs sentence-by-sentence. ElevenLabs could synthesize the first sentence while the LLM is still generating the second, overlapping the latency of phase 2 and 3 and achieving near-instantaneous replies.
