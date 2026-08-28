import { useEffect, useRef, useState } from 'react'

// Points at the Vite dev proxy (see vite.config.js), which forwards to the
// Java backend on http://localhost:4567. Change this if you deploy the
// backend elsewhere.
const API_URL = '/api/ask'

// No-API-key YouTube search through public Piped / Invidious instances. We
// try them in order and keep the first usable video result. Public instances
// come and go, which is why there is a list rather than a single URL.
const VIDEO_SEARCH_BACKENDS = [
  {
    search: (q) =>
        `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=videos`,
    parse: parsePiped,
  },
  {
    search: (q) =>
        `https://pipedapi.adminforge.de/search?q=${encodeURIComponent(q)}&filter=videos`,
    parse: parsePiped,
  },
  {
    search: (q) =>
        `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    parse: parseInvidious,
  },
  {
    search: (q) =>
        `https://invidious.jing.rocks/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
    parse: parseInvidious,
  },
]

function parsePiped(data) {
  const item = (data?.items || []).find(
      (i) => typeof i.url === 'string' && i.url.includes('v='),
  )
  if (!item) return null
  return {
    id: new URLSearchParams(item.url.split('?')[1]).get('v'),
    title: item.title || '',
    author: item.uploaderName || 'Desconocido',
  }
}

function parseInvidious(data) {
  const item = (Array.isArray(data) ? data : []).find((i) => i.videoId)
  if (!item) return null
  return {
    id: item.videoId,
    title: item.title || '',
    author: item.author || 'Desconocido',
  }
}

// Simple recreation of Claude's sunburst mark, drawn as inline SVG in
// Anthropic's brand clay/orange (#D97757) since we can't fetch or embed
// third-party/brand image assets directly here.
function ClaudeLogo({ className }) {
  const rays = Array.from({ length: 8 })
  return (
      <svg
          className={className}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Claude logo"
      >
        <g fill="#D97757">
          {rays.map((_, i) => {
            const angle = (i * 360) / rays.length
            return (
                <path
                    key={i}
                    d="M50 50 L46 8 Q50 2 54 8 Z"
                    transform={`rotate(${angle} 50 50)`}
                />
            )
          })}
        </g>
      </svg>
  )
}

// Loads the YouTube IFrame Player API <script> exactly once and resolves
// with window.YT when it is ready to use.
let ytApiPromise = null
function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise

  ytApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous()
      resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

// Renders a YouTube player inside the frame plus Play / Pause / Stop buttons
// that drive it through the IFrame Player API. Pass a `videoId` for a known
// video, or a `searchQuery` to let the player load the first search result.
function YouTubePlayer({ videoId, searchQuery }) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)

    // YT.Player replaces the element we hand it with an <iframe>, so give it
    // a throwaway child and never let it touch React's own container node.
    const host = document.createElement('div')
    containerRef.current?.appendChild(host)

    loadYouTubeIframeApi()
        .then((YT) => {
          if (cancelled) return
          playerRef.current = new YT.Player(host, {
            videoId: videoId || undefined,
            playerVars: {
              rel: 0,
              modestbranding: 1,
              ...(videoId ? {} : { listType: 'search', list: searchQuery }),
            },
            events: {
              onReady: () => {
                if (!cancelled) setReady(true)
              },
            },
          })
        })
        .catch(() => {})

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        // player may already be gone
      }
      playerRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [videoId, searchQuery])

  function control(method) {
    try {
      playerRef.current?.[method]?.()
    } catch {
      // ignore: player not ready yet or a transient cross-origin hiccup
    }
  }

  return (
      <>
        <div className="console__video-frame">
          <div ref={containerRef} className="console__video-embed" />
        </div>
        <div className="console__video-controls">
          <button
              type="button"
              className="console__video-btn"
              onClick={() => control('playVideo')}
              disabled={!ready}
          >
            ▶ Reproducir
          </button>
          <button
              type="button"
              className="console__video-btn"
              onClick={() => control('pauseVideo')}
              disabled={!ready}
          >
            ⏸ Pausar
          </button>
          <button
              type="button"
              className="console__video-btn"
              onClick={() => control('stopVideo')}
              disabled={!ready}
          >
            ⏹ Detener
          </button>
        </div>
      </>
  )
}

export default function App() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [video, setVideo] = useState(null) // { id, searchQuery, title, author }
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState('')

  async function fetchAnswer(trimmedQuestion) {
    setLoading(true)
    setError('')
    setAnswer('')

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      setAnswer(data.answer)
    } catch (err) {
      setError(err.message || 'Something went wrong talking to Claude.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchVideo(trimmedQuestion) {
    setVideoLoading(true)
    setVideoError('')
    setVideo(null)

    let found = null
    for (const backend of VIDEO_SEARCH_BACKENDS) {
      try {
        const response = await fetch(backend.search(trimmedQuestion))
        if (!response.ok) continue
        const parsed = backend.parse(await response.json())
        if (parsed?.id) {
          found = parsed
          break
        }
      } catch {
        // instance unreachable / CORS / bad payload — try the next one
      }
    }

    if (found) {
      setVideo(found)
    } else {
      // Last resort: let the embedded player run the search itself.
      setVideo({
        id: null,
        searchQuery: trimmedQuestion,
        title: `Resultados de YouTube para "${trimmedQuestion}"`,
        author: 'YouTube',
      })
    }
    setVideoLoading(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || loading) return

    // Fired independently: a slow/failed video lookup never blocks or
    // breaks the actual Claude answer.
    fetchAnswer(trimmed)
    fetchVideo(trimmed)
  }

  return (
      <div className="page">
        <div className="console">
          <header className="console__header">
            <span className="console__dot" />
            <span className="console__dot" />
            <span className="console__dot" />
            <h1 className="console__title">Pregúntale a Claude</h1>
          </header>

          <form className="console__form" onSubmit={handleSubmit}>
            <label className="console__label console__label--with-icon" htmlFor="question">
              <ClaudeLogo className="console__logo" />
              Tu pregunta
            </label>
            <textarea
                id="question"
                className="console__input"
                placeholder="Ej. ¿Cuál es tu carro favorito?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
            />
            <button
                type="submit"
                className="console__button"
                disabled={loading || !question.trim()}
            >
              {loading && <span className="spinner spinner--button" aria-hidden="true" />}
              {loading ? 'Pensando…' : 'Preguntar'}
            </button>
          </form>

          <div className="console__body">
            <div className="console__output-block">
              <span className="console__label">Respuesta</span>
              <div className="console__output-wrap">
              <textarea
                  className="console__output"
                  value={
                    loading
                        ? ''
                        : error
                            ? error
                            : answer || 'La respuesta aparecerá aquí.'
                  }
                  readOnly
                  data-state={error ? 'error' : loading ? 'loading' : answer ? 'filled' : 'empty'}
                  rows={10}
              />
                {loading && (
                    <div className="console__loading-overlay">
                      <span className="spinner" aria-hidden="true" />
                      <span>Claude está pensando...</span>
                    </div>
                )}
              </div>
            </div>

            <div className="console__video-block">
              <span className="console__label">Video relacionado</span>

              {videoLoading && (
                  <div className="console__video-frame">
                    <div className="console__image-placeholder">
                      <span className="spinner" aria-hidden="true" />
                    </div>
                  </div>
              )}

              {!videoLoading && videoError && (
                  <div className="console__video-frame">
                    <div className="console__image-placeholder console__image-placeholder--error">
                      {videoError}
                    </div>
                  </div>
              )}

              {!videoLoading && !videoError && video && (
                  <YouTubePlayer
                      key={video.id || video.searchQuery}
                      videoId={video.id}
                      searchQuery={video.searchQuery}
                  />
              )}

              {!videoLoading && !videoError && !video && (
                  <div className="console__video-frame">
                    <div className="console__image-placeholder">
                      El video aparecerá aquí.
                    </div>
                  </div>
              )}

              {video && !videoLoading && !videoError && (
                  <a
                      className="console__image-credit"
                      href={
                        video.id
                            ? `https://www.youtube.com/watch?v=${video.id}`
                            : `https://www.youtube.com/results?search_query=${encodeURIComponent(video.searchQuery)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                  >
                    {video.title} — {video.author}
                  </a>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}
