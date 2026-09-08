import { useEffect, useRef, useState } from 'react'

// Both endpoints go through the Vite dev proxy (see vite.config.js), which
// forwards to the Java backend on http://localhost:4567. Change these if you
// deploy the backend elsewhere.
const API_URL = '/api/ask'
// GET /api/video?q=...&count=N -> { videos: [{ videoId, title, author }, ...] }.
// The backend does the YouTube search (no API key) so the browser never hits
// CORS or a flaky public search instance.
const VIDEO_API_URL = '/api/video'
// GET /api/posts?q=<car model> -> { posts: [{ id, text, createdAt }, ...] }.
// The backend queries the X API for @tucoche_'s recent posts about the model,
// so the browser never handles the X bearer token.
const POSTS_API_URL = '/api/posts'
// The X account whose posts the panel shows; used only for display and links.
const X_ACCOUNT = 'tucoche_'

// Read-only prefix the user's car model is appended to, both for the prompt
// sent to Claude and for the sentence shown in the form.
const QUESTION_PREFIX = 'Give me the review for'

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

function YoutubeIcon({ className }) {
  return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-youtube"
           viewBox="0 0 16 16">
        <path
            d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"/>
      </svg>
  )
}

// The X (formerly Twitter) wordmark glyph, drawn inline so we don't embed a
// third-party brand asset. fill="currentColor" so it takes the label color.
function XIcon({ className }) {
  return (
      <svg
          className={className}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          viewBox="0 0 16 16"
          role="img"
          aria-hidden="true"
      >
        <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.6.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z" />
      </svg>
  )
}

// Bootstrap Icons "question-circle-fill" (https://icons.getbootstrap.com/).
// fill="currentColor" so it takes the button's text color.
function QuestionIcon({className}) {
  return (
      <svg
          className={className}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          viewBox="0 0 16 16"
          role="img"
          aria-hidden="true"
      >
        <path
            d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.496 6.033h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286a.237.237 0 0 0 .241.247m2.325 6.443c.61 0 1.029-.394 1.029-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94 0 .533.425.927 1.01.927z" />
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
// that drive it through the IFrame Player API.
function YouTubePlayer({ videoId }) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setPlaying(false)

    // YT.Player replaces the element we hand it with an <iframe>, so give it
    // a throwaway child and never let it touch React's own container node.
    const host = document.createElement('div')
    containerRef.current?.appendChild(host)

    loadYouTubeIframeApi()
        .then((YT) => {
          if (cancelled) return
          playerRef.current = new YT.Player(host, {
            videoId,
            playerVars: { rel: 0, modestbranding: 1 },
            events: {
              onReady: () => {
                if (!cancelled) setReady(true)
              },
              // Drive the toggle from the player itself, so it stays honest when
              // the video is started elsewhere (the iframe's own controls) or
              // stops on its own (clip ends).
              onStateChange: (event) => {
                if (!cancelled) setPlaying(event.data === YT.PlayerState.PLAYING)
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
  }, [videoId])

  function togglePlayback() {
    try {
      // Ask the player what to do next rather than trusting `playing`: the state
      // event can lag a click, and acting on a stale value drops the toggle.
      playerRef.current?.[playing ? 'pauseVideo' : 'playVideo']?.()
    } catch {
      // ignore: player not ready yet or a transient cross-origin hiccup
    }
  }

  // Scoped to the video so the label's `for` still matches when the clip changes.
  const toggleId = `pp-01-toggle-${videoId}`

  return (
      <>
        <div className="console__video-frame">
          <div ref={containerRef} className="console__video-embed" />
        </div>
        <div className="console__video-controls">
          <input
              className="pp-01__chk"
              type="checkbox"
              id={toggleId}
              checked={playing}
              onChange={togglePlayback}
              disabled={!ready}
              aria-label={playing ? 'Pausar el video' : 'Reproducir el video'}
          />
          <label className="pp-01__btn" htmlFor={toggleId}>
            <span className="pp-01__bars" aria-hidden="true"><i /><i /></span>
          </label>
        </div>
      </>
  )
}

export default function App() {
  const [model, setModel] = useState('')   // the car the user wants reviewed
  const [count, setCount] = useState(3)     // how many videos to pull (1..10)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [videos, setVideos] = useState([])         // [{ id, title, author }]
  const [selectedId, setSelectedId] = useState(null) // which one plays in the frame
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState('')

  const [posts, setPosts] = useState([])           // [{ id, text, createdAt }] from @tucoche_
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsError, setPostsError] = useState('')

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

  async function fetchVideos(carModel, howMany) {
    setVideosLoading(true)
    setVideosError('')
    setVideos([])
    setSelectedId(null)

    try {
      const response = await fetch(
          `${VIDEO_API_URL}?q=${encodeURIComponent(`${carModel} review`)}&count=${howMany}`,
      )
      const data = await response.json()

      if (!response.ok || !Array.isArray(data.videos) || data.videos.length === 0) {
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      const list = data.videos.map((v) => ({
        id: v.videoId,
        title: v.title || carModel,
        author: v.author || 'YouTube',
      }))
      setVideos(list)
      setSelectedId(list[0].id) // first result plays by default; user can switch
    } catch (err) {
      setVideosError('No se pudieron cargar los videos para esta pregunta.')
    } finally {
      setVideosLoading(false)
    }
  }

  async function fetchPosts(carModel) {
    setPostsLoading(true)
    setPostsError('')
    setPosts([])

    try {
      const response = await fetch(`${POSTS_API_URL}?q=${encodeURIComponent(carModel)}`)
      const data = await response.json()

      if (!response.ok || !Array.isArray(data.posts)) {
        console.log('Exception response not ok',response.body)
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      setPosts(data.posts)
    } catch (err) {
      console.log('Exception: ',err)
      setPostsError('No se pudieron cargar los posts de X para este modelo.')
    } finally {
      setPostsLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = model.trim()
    if (!trimmed || loading) return

    // Fired independently: a slow/failed video or X lookup never blocks or
    // breaks the actual Claude answer.
    fetchAnswer(`${QUESTION_PREFIX} ${trimmed}`)
    fetchVideos(trimmed, count)
    fetchPosts(trimmed)
  }

  return (
      <div className="page">
        <div className="console">
          <header className="console__header">
            <span className="console__dot" />
            <span className="console__dot" />
            <span className="console__dot" />
            <h1 className="console__title">TU COCHE'S REVIEW</h1>
          </header>

          <form className="console__form" onSubmit={handleSubmit}>
            <label className="console__label console__label--with-icon" htmlFor="question">
              <ClaudeLogo className="console__logo" />
              TU COCHE REVIEW'S QUESTION
            </label>
            <div className="console__q-row">
              <span className="console__q-fixed">{QUESTION_PREFIX}</span>
              <input
                  id="question"
                  className="console__q-input"
                  type="text"
                  placeholder="e.g. Nissan Skyline GTR"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
              />
              <select
                  className="console__q-count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  aria-label="Number of videos"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} video{n > 1 ? 's' : ''}
                    </option>
                ))}
              </select>
              <span className="console__q-fixed">from YouTube</span>
            </div>
            <button
                type="submit"
                className="console__button"
                disabled={loading || !model.trim()}
            >
              {loading
                  ? <span className="spinner spinner--button" aria-hidden="true" />
                  : <QuestionIcon className="console__button-icon" />}
              {loading ? 'Thinking…' : 'ASK'}
            </button>
          </form>

          <div className="console__body">
            <div className="console__output-block">
              <span className="console__label">RESPONSE</span>
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
                      <span>Thinking ...</span>
                    </div>
                )}
              </div>
            </div>

            <div className="console__video-block">
              <span className="console__label console__label--with-icon">
                <YoutubeIcon className="console__youtube-icon" />
                YOUTUBE VIDEO
              </span>

              {videosLoading && (
                  <div className="console__video-frame">
                    <div className="console__image-placeholder">
                      <span className="spinner" aria-hidden="true" />
                    </div>
                  </div>
              )}

              {!videosLoading && videosError && (
                  <div className="console__video-frame">
                    <div className="console__image-placeholder console__image-placeholder--error">
                      {videosError}
                    </div>
                  </div>
              )}

              {!videosLoading && !videosError && selectedId && (
                  <YouTubePlayer key={selectedId} videoId={selectedId} />
              )}

              {!videosLoading && !videosError && !selectedId && (
                  <div className="console__video-frame">
                    <div className="console__image-placeholder">
                      El video aparecerá aquí.
                    </div>
                  </div>
              )}

            </div>

            {/* Third cell in the 2-col grid, so it sits bottom-left, under RESPONSE
                and level with the video list that follows it in the fourth cell. */}
            <div className="console__posts-block">
              <span className="console__label console__label--with-icon">
                <XIcon className="console__x-icon" />
                POSTS FROM @{X_ACCOUNT.toUpperCase()}
              </span>

              <div className="console__posts-wrap">
                {postsLoading && (
                    <div className="console__posts-status">
                      <span className="spinner" aria-hidden="true" />
                      <span>Buscando posts…</span>
                    </div>
                )}

                {!postsLoading && postsError && (
                    <div className="console__posts-status console__posts-status--error">
                      {postsError}
                    </div>
                )}

                {!postsLoading && !postsError && posts.length === 0 && (
                    <div className="console__posts-status">
                      Los posts de X aparecerán aquí.
                    </div>
                )}

                {!postsLoading && !postsError && posts.length > 0 && (
                    <ul className="console__posts-list">
                      {posts.map((p) => (
                          <li key={p.id}>
                            <a
                                className="console__post"
                                href={`https://x.com/${X_ACCOUNT}/status/${p.id}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                              <span className="console__post-text">{p.text}</span>
                              {p.createdAt && (
                                  <span className="console__post-date">
                                    {new Date(p.createdAt).toLocaleDateString()}
                                  </span>
                              )}
                            </a>
                          </li>
                      ))}
                    </ul>
                )}
              </div>
            </div>

            {/* Fourth cell: bottom-right. Auto-placement puts it in the same grid row
                as the posts panel, which is what keeps the two lists level. */}
            {!videosLoading && !videosError && videos.length > 0 && (
                <div className="console__video-list-block">
                  <span className="console__label console__label--with-icon">
                    <YoutubeIcon className="console__youtube-icon" />
                    VIDEO RESULTS
                  </span>

                  <ul className="console__video-list">
                    {videos.map((v, i) => (
                        <li key={v.id}>
                          <button
                              type="button"
                              className={
                                'console__video-item' +
                                (v.id === selectedId ? ' is-selected' : '')
                              }
                              onClick={() => setSelectedId(v.id)}
                              aria-pressed={v.id === selectedId}
                          >
                            <img
                                className="console__video-thumb"
                                src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                                alt=""
                                loading="lazy"
                            />
                            <span className="console__video-meta">
                              <span className="console__video-title">
                                {i + 1}. {v.title}
                              </span>
                              <span className="console__video-author">{v.author}</span>
                            </span>
                          </button>
                        </li>
                    ))}
                  </ul>
                </div>
            )}
          </div>
        </div>
      </div>
  )
}
