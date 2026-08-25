# 🎙️  AI Interview Agent

An end-to-end, multilingual voice interview agent built to screen AI Intern candidates. The agent conducts a real-time voice interview, evaluates candidates against a predefined rubric, and generates a structured feedback report.

## 🚀 Features
- **Real-time Voice Pipeline**: WebSocket-based architecture for low-latency STT (Groq Whisper) -> LLM (Gemini 2.5 Flash) -> TTS (ElevenLabs).
- **Multilingual Support**: Seamlessly switch between English, Hindi, and German. The STT, LLM, and TTS models automatically adapt to the chosen language.
- **Semantic Grounding**: Answers are evaluated against a predefined Q&A dataset stored in a Pinecone vector database, ensuring accurate and objective feedback.
- **Glassmorphism UI**: A beautiful, modern React frontend with responsive hold-to-talk mechanics and real-time auto-scrolling transcripts.
- **Structured Feedback**: Generates a comprehensive JSON scorecard (score, strengths, weaknesses) using Gemini's structured output mode.

## 🛠️ Tech Stack
- **Frontend**: React + Vite + Vanilla CSS
- **Backend**: Node.js + Express + `ws`
- **Speech-to-Text (STT)**: Groq (`whisper-large-v3`)
- **LLM**: Google Gemini 2.5 Flash (`@google/genai`)
- **Text-to-Speech (TTS)**: ElevenLabs (`eleven_multilingual_v2`)
- **Vector Database**: Pinecone

## 📦 Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
# Google AI Studio (LLM + Embeddings)
GOOGLE_AI_STUDIO_API_KEY="your_api_key"

# Pinecone (Vector DB)
PINECONE_API_KEY="your_pinecone_key"

# Groq (Speech-to-Text)
GROQ_API_KEY="your_groq_key"

# ElevenLabs (Text-to-Speech)
ELEVENLABS_API_KEY="your_elevenlabs_key"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Ingest Q&A Dataset
Initialize the Pinecone index and embed the dataset (`data/qa-dataset.json`):
```bash
npm run ingest
```

### 4. Run the Application
Start both the React frontend and the Express/WebSocket backend concurrently:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

## 🏗️ Architecture
See [docs/architecture-note.md](./docs/architecture-note.md) for a detailed breakdown of the latency tradeoffs, edge cases, and failure modes handled in this prototype.
