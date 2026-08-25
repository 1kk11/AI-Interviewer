# Deployment Guide - Voice Interview Agent

This guide walks you through deploying the **Backend** to **Render** and the **Frontend** to **Vercel** from your GitHub repository: `https://github.com/1kk11/AI-Interviewer.git`.

---

## 1. Deploy the Backend on Render

The backend is built with Node.js and Express. It also serves a WebSocket connection (`/ws`) for real-time audio streaming. We have configured a `render.yaml` Blueprint file at the root to automate this deployment.

### Step-by-Step Instructions:

1. **Sign Up / Log In**: Go to [Render](https://render.com) and log in.
2. **Go to Blueprints**:
   - In the Render Dashboard, click the **New** button at the top right and select **Blueprint**.
3. **Connect Your GitHub Repository**:
   - Search for and select the repository `AI-Interviewer` (from `https://github.com/1kk11/AI-Interviewer.git`).
4. **Configure the Blueprint**:
   - Give the group a name (e.g., `voice-interview-agent`).
   - Render will read the `render.yaml` file from the root and automatically list the configuration settings.
   - It will prompt you for the required environment variables. Copy the values from your local `.env` file:
     - `AZURE_OPENAI_KEY`: Your Azure OpenAI API key.
     - `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint.
     - `GROQ_API_KEY`: Your Whisper STT API key.
     - `GOOGLE_AI_STUDIO_API_KEY`: Your Google Gemini API key (for embeddings).
     - `ELEVENLABS_API_KEY`: Your ElevenLabs API key (for TTS).
     - `PINECONE_API_KEY`: Your Pinecone API key.
   - Note: Other variables like `PORT` (10000), `LLM_PROVIDER` (`azure_openai`), `PINECONE_INDEX` (`ai-intern-qa`), and `DEFAULT_LANGUAGE` (`en`) have pre-filled default values.
5. **Approve and Deploy**:
   - Click **Approve**. Render will provision your service.
   - Under the hood, it sets the root directory to `backend`, runs `npm install`, and starts the server using `npm start`.
6. **Note Your Service Domain**:
   - Once the deployment is complete and the log says `server listening on http://localhost:10000`, copy the service URL from the top of the Render page (e.g., `https://your-service-name.onrender.com`).

---

## 2. Deploy the Frontend on Vercel

The frontend is a React application powered by Vite. Because the project is a monorepo, we must configure Vercel to build from the `frontend` subfolder.

### Step-by-Step Instructions:

1. **Sign Up / Log In**: Go to [Vercel](https://vercel.com) and log in.
2. **Import Project**:
   - Click **Add New** at the top right, select **Project**, and import your `AI-Interviewer` GitHub repository.
3. **Configure Monorepo Settings**:
   - On the configure screen, click **Edit** next to the **Root Directory** field.
   - Select the `frontend` directory and click **Continue**.
   - Vercel will automatically select **Vite** as the framework preset.
4. **Build & Development Settings** (Keep defaults):
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. **Set Environment Variables**:
   - Expand the **Environment Variables** section.
   - Add the following variables to link the frontend to your newly deployed Render backend:
     - **`VITE_API_URL`**: `https://your-service-name.onrender.com/api/interview` (replace `your-service-name` with your actual Render service URL).
     - **`VITE_WS_URL`**: `wss://your-service-name.onrender.com/ws` (replace `your-service-name` with your actual Render service URL. Note the `wss://` protocol prefix for secure WebSockets).
6. **Deploy**:
   - Click the **Deploy** button. Vercel will compile the React app and deploy it.
   - Once completed, Vercel will provide you with a live domain (e.g., `https://your-project-name.vercel.app`).

---

## 3. Verification & Troubleshooting

### WebSocket Connections:
- On Render, the free tier web service supports standard HTTPS and WebSockets. Ensure you use `wss://` (secure WebSockets) when pointing your frontend to Render.
- If your Render service spins down (which happens on the free tier after 15 minutes of inactivity), the first load or session initialization might take ~50 seconds to boot up. This is normal behavior for Render Free Tier.

### Verification Steps:
1. Open your Vercel deployment URL in a browser.
2. Fill in the job title, company name, upload a resume and JD, then click **Start Session**.
3. Confirm that the application loads and you hear the voice greeting from the interviewer, verifying both the HTTP request and the WebSocket connection are functional.
