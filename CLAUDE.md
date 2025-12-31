# SubzCreator - Development Documentation

**Last Updated:** December 31, 2025
**Project Version:** 1.0.0
**Status:** Translation & Editor Features Complete

## Project Overview

SubzCreator is a comprehensive transcription and subtitling platform, built as a Happy Scribe clone for private usage. It provides automated speech recognition (ASR), subtitle generation, translation services, and collaborative editing capabilities for audio and video files.

## Tech Stack (Latest Stable - December 2025)

### Core Framework
- **Next.js**: 16.1.1 (with Turbopack support)
- **React**: 19.2.3
- **TypeScript**: 5.9.3
- **Node.js**: 22 LTS

### Styling
- **Tailwind CSS**: 4.1.18
- **PostCSS**: 8.5.6
- **Autoprefixer**: 10.4.23

### State Management & Utilities
- **Zustand**: 5.0.9 (State management)
- **clsx**: 2.1.1 (Conditional classnames)
- **tailwind-merge**: 3.4.0 (Merge Tailwind classes)
- **date-fns**: 4.1.0 (Date utilities)

### Backend & Data
- **NocoDB SDK**: 0.265.1 (Database interface)
- **OpenAI SDK**: 6.15.0 (ASR services - compatible with Groq & Berget)
- **Axios**: 1.13.2 (HTTP client)

### Cloud Storage

- **AWS SDK S3**: 3.958.0 (S3-compatible storage)

## Project Structure

```
TOOL--Subz-Creator/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── auth/                 # NextAuth endpoints
│   │   ├── files/                # File management
│   │   ├── transcriptions/       # Transcription CRUD
│   │   ├── segments/             # Segment editing
│   │   ├── translate/            # Translation service
│   │   │   ├── route.ts          # POST - Start translation
│   │   │   ├── stream/route.ts   # POST - Streaming translation
│   │   │   └── [transcriptionId]/route.ts  # GET/DELETE translations
│   │   ├── translated-segments/  # Translated segment editing
│   │   └── export/               # SRT/VTT export
│   ├── dashboard/                # Main dashboard
│   ├── transcription/[id]/       # Transcription editor
│   ├── login/                    # Login page
│   ├── globals.css               # Global styles + design tokens
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing page (redirects)
├── lib/                          # Utility functions
│   ├── db/nocodb.ts              # NocoDB client
│   ├── asr/                      # ASR providers
│   │   ├── berget.ts             # Berget AI (KB Whisper)
│   │   └── groq.ts               # Groq (Whisper v3)
│   ├── translation/              # Translation service
│   │   ├── index.ts              # Provider factory
│   │   ├── openai.ts             # OpenAI provider
│   │   ├── berget.ts             # Berget AI provider
│   │   └── prompts.ts            # Translation prompts
│   └── types/index.ts            # TypeScript types
├── components/                   # React components
│   ├── upload/FileUploader.tsx   # Drag & drop uploader
│   ├── TranslationModal.tsx      # Translation UI
│   ├── ExportModal.tsx           # Export dialog
│   └── UserMenu.tsx              # User dropdown
├── auth.ts                       # NextAuth configuration
├── auth.config.ts                # Auth providers
├── .env.example                  # Environment template
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies & scripts
└── CLAUDE.md                     # This file
```

## Environment Configuration

The project uses environment variables for configuration. Key variables:

### Database - NocoDB
- `NOCODB_URL`: NocoDB instance URL (https://nocodb.labbytan.se)
- `NOCODB_API_TOKEN`: Authentication token
- `NOCODB_BASE_NAME`: Base name (SubzCreator)

### ASR Services (OpenAI Compatible)
- **Berget AI** (Default): KB Whisper - Swedish-optimized Whisper model
  - `BERGET_API_KEY`: API key
  - `BERGET_BASE_URL`: https://api.berget.ai/v1
  - Model: `kb-whisper`
  - Features: Segment + word-level timestamps, ~15x real-time speed

- **Groq** (Alternative): Standard Whisper
  - `GROQ_API_KEY`: API key
  - `GROQ_BASE_URL`: https://api.groq.com/openai/v1
  - Model: `whisper-large-v3`

- `DEFAULT_ASR_PROVIDER`: Set to "berget" (default) or "groq"

### Translation Services (LLM)

- **Berget AI** (Default): Swedish AI with EU data residency
  - Uses same `BERGET_API_KEY` as ASR
  - Model: `openai/gpt-oss-120b` (reasoning) or `mistralai/Mistral-Small-3.2-24B-Instruct-2506`
  - `BERGET_TRANSLATION_MODEL`: Override default model

- **OpenAI** (Alternative): GPT-4.1
  - `OPENAI_API_KEY`: API key
  - `TRANSLATION_MODEL`: Model to use (default: `gpt-4.1`)

- `TRANSLATION_PROVIDER`: Set to "berget" (default) or "openai"
- `TRANSLATION_BATCH_SIZE`: Segments per API call (default: 25)

### Object Storage (S3-Compatible)

- `S3_ENDPOINT`: S3 endpoint URL
- `S3_ACCESS_KEY`: Access key
- `S3_SECRET_KEY`: Secret key
- `S3_BUCKET`: Bucket name
- `S3_REGION`: Region (default: auto)

### Redis
- Optional caching layer
- Default: `redis://localhost:6379`

## Available Scripts

```bash
# Development server with Turbopack
npm run dev

# Production build
npm run build

# Start production server
npm start

# TypeScript type checking
npm run type-check

# Linting (when ESLint is configured)
npm run lint
```

## NocoDB Integration

NocoDB is used as the primary database. Key points:

1. **Naming Convention**: NocoDB uses camelCase with capitalized IDs
   - `Id` (not `id`)
   - `CreatedAt` (not `created_at`)
   - `UpdatedAt` (not `updated_at`)

2. **Table Creation**: Always request the user to create tables manually to avoid permission errors

3. **API Version**: Using NocoDB 2025.09.0 with new v2 API endpoints

## Development Phases

### Phase 1: Core Functionality ✅

- ✅ Project initialization
- ✅ ASR integration (Berget KB Whisper + Groq)
- ✅ File upload and management (S3 storage, thumbnails)
- ✅ Interactive transcript editor with video sync
- ✅ Export to SRT, VTT formats
- ✅ User authentication (NextAuth with Google/GitHub)

### Phase 2: Advanced Features ✅

- ✅ Interactive editor with video synchronization
- ✅ Inline text editing (click to edit segments)
- ✅ Inline time editing (click to edit start/end times)
- ✅ CPS (characters per second) display
- ✅ Export modal with format selection and preview

### Phase 3: AI & Optimization ✅

- ✅ Multi-language support (35+ languages)
- ✅ Translation service (Berget AI + OpenAI)
- ✅ Real-time translation progress with streaming
- ✅ Language toggle to view original vs translated
- ✅ Export translated subtitles

### Phase 4: Enterprise & Integrations

- ⏳ SSO and advanced security
- ⏳ API development
- ⏳ Human transcription workflow
- ⏳ Glossaries and style guides

## Key Features (From PRD)

1. **File Upload**: Support for 45+ audio/video formats
2. **ASR Processing**: 3-4x faster than real-time transcription
3. **Interactive Editor**: Synchronized playback and editing
4. **Subtitle Generation**: Multiple export formats (SRT, VTT, STL, etc.)
5. **Translation**: Multi-language support
6. **Quality Center**: Glossaries, style guides, custom settings

## NocoDB Tables

The following tables are required in NocoDB:

### Users

- `Id` (AutoNumber)
- `Email` (SingleLineText)
- `Name` (SingleLineText)
- `Image` (SingleLineText)
- `CreatedAt` (DateTime)
- `UpdatedAt` (DateTime)

### Files

- `Id` (AutoNumber)
- `UserId` (Number)
- `Filename` (SingleLineText)
- `StorageUrl` (SingleLineText)
- `AudioUrl` (SingleLineText)
- `ThumbnailUrl` (SingleLineText)
- `FileType` (SingleLineText) - audio/video
- `Duration` (Decimal)
- `FileSize` (Number)
- `CreatedAt` (DateTime)

### Transcriptions

- `Id` (AutoNumber)
- `UserId` (Number)
- `FileId` (Number)
- `Title` (SingleLineText)
- `Status` (SingleLineText) - pending/processing/completed/failed
- `Language` (SingleLineText)
- `Duration` (Decimal)
- `AsrProvider` (SingleLineText)
- `Confidence` (Decimal)
- `TranscriptText` (LongText)
- `CreatedAt` (DateTime)
- `UpdatedAt` (DateTime)

### TranscriptionSegments

- `Id` (AutoNumber)
- `TranscriptionId` (Number)
- `SegmentIndex` (Number)
- `Text` (LongText)
- `StartTime` (Decimal)
- `EndTime` (Decimal)
- `SpeakerId` (SingleLineText)
- `Confidence` (Decimal)
- `CreatedAt` (DateTime)

### TranslatedSegments

- `Id` (AutoNumber)
- `TranscriptionId` (Number)
- `OriginalSegmentId` (Number)
- `SegmentIndex` (Number)
- `TargetLanguage` (SingleLineText)
- `TranslatedText` (LongText)
- `StartTime` (Decimal)
- `EndTime` (Decimal)
- `CreatedAt` (DateTime)
- `UpdatedAt` (DateTime)

## Next Steps

1. Enterprise features:
   - SSO integration
   - API key management
   - Usage analytics

2. Quality improvements:
   - Glossaries and style guides
   - Custom terminology
   - Speaker identification

## Important Notes

- Always use stable versions of dependencies
- Search the internet for latest versions when unsure
- Store all project documentation in `Claude_Documentation/` folder
- Keep `CLAUDE.md` in the root directory
- Request user to create NocoDB tables to avoid permission issues
- Use NocoDB camelCase naming convention

## Resources

- [PRD Document](Claude_Documentation/PRD.md)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [NocoDB API Docs](https://meta-apis-v2.nocodb.com/)
- [Tailwind CSS 4 Docs](https://tailwindcss.com/docs)

---

**Note**: This is a living document. Update it as the project evolves.
