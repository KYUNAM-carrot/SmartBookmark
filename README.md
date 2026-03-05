# SmartBookmark Pro

AI 기반 즐겨찾기, 방문기록, 유튜브 시청기록 통합 관리 크롬 확장 프로그램

## Features

- **즐겨찾기 관리** — 스마트 제목, 태그, 중복 제거, 퍼지 검색, 하이라이트/메모
- **방문기록 기반 자동분류** — 자주 방문 페이지 분석 및 즐겨찾기 자동 추천
- **유튜브 시청기록** — 영상 자동 저장, 타임스탬프 북마크, 카테고리 분류
- **보안 잠금** — 비밀번호/패턴 잠금, 자동 잠금
- **AI 어시스턴트** — OpenAI, Claude, Gemini, Ollama 멀티 프로바이더 지원
- **탭 세션 관리** — 현재 탭 세션 저장/복원
- **스마트 광고** — 비침습적 네이티브 광고 (무료 티어)

## Tech Stack

- Chrome Extension Manifest V3
- React 18 + TypeScript + Tailwind CSS
- Vite + CRXJS
- Zustand (state management)
- Web Crypto API (security)

## Development

```bash
npm install
npm run dev     # Development with hot reload
npm run build   # Production build
```

## License

MIT
