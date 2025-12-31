# SubzCreator

A professional transcription and subtitling platform for audio and video content.

## Features

- **Automated Speech Recognition** - Powered by Berget AI (KB Whisper) and Groq (Whisper v3)
- **Multi-format Support** - Audio and video formats (mp3, mp4, wav, mov, mkv, etc.)
- **Interactive Editor** - Synchronized video playback with inline text/time editing
- **Subtitle Export** - SRT, VTT, ASS, TXT, and JSON formats
- **Translation** - Multi-language support with Berget AI and OpenAI
- **Burnt-in Subtitles** - Export video with hardcoded subtitles

## Tech Stack

- **Framework**: Next.js 16.1 with React 19
- **Language**: TypeScript 5.9
- **Styling**: Tailwind CSS 4
- **Database**: NocoDB
- **State**: Zustand 5
- **Runtime**: Node.js 22 LTS

## Getting Started

### Prerequisites

- Node.js 22 LTS or higher
- NocoDB instance
- API keys for ASR services (Berget AI or Groq)
- S3-compatible object storage

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mickekring/TOOL--Subz-Creator.git
cd TOOL--Subz-Creator
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

- `NOCODB_URL` and `NOCODB_API_TOKEN`
- `BERGET_API_KEY` (for ASR and translation)
- `GROQ_API_KEY` (optional, alternative ASR)
- `OPENAI_API_KEY` (optional, alternative translation)
- S3 credentials (`S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`)

4. Set up NocoDB tables (see CLAUDE.md for schemas)

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/                    # Next.js App Router
  api/                  # API routes
  dashboard/            # Main dashboard
  transcription/[id]/   # Transcription editor
components/             # React components
lib/                    # Utilities
  asr/                  # ASR providers (Berget, Groq)
  translation/          # Translation providers
  db/                   # NocoDB client
  storage/              # S3 storage
  export/               # Subtitle generation
```

## Available Scripts

```bash
npm run dev        # Development server with Turbopack
npm run build      # Production build
npm start          # Production server
npm run type-check # TypeScript type checking
```

## Development Status

### Phase 1: Core Functionality - Complete

- File upload and management
- ASR integration with segment timestamps
- Dashboard with file/transcription management

### Phase 2: Advanced Features - Complete

- Interactive editor with video synchronization
- Inline text and time editing
- CPS (characters per second) display
- Export modal with format selection

### Phase 3: AI and Optimization - Complete

- Multi-language support (35+ languages)
- Translation service with streaming progress
- Language toggle (original vs translated)
- Export translated subtitles

### Phase 4: Enterprise - Planned

- SSO and advanced security
- API development
- Glossaries and style guides

## License

ISC
