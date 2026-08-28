import { useState } from 'react'

// Points at the Vite dev proxy (see vite.config.js), which forwards to the
// Java backend on http://localhost:4567. Change this if you deploy the
// backend elsewhere.
const API_URL = '/api/ask'

// Free, no-API-key-needed search of Creative Commons / public domain images.
// https://api.openverse.org/v1/images/
const IMAGE_SEARCH_URL = 'https://api.openverse.org/v1/images/'

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

export default function App() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [image, setImage] = useState(null) // { url, title, creator, sourceUrl }
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')

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

  async function fetchImage(trimmedQuestion) {
    setImageLoading(true)
    setImageError('')
    setImage(null)

    try {
      const url = `${IMAGE_SEARCH_URL}?q=${encodeURIComponent(trimmedQuestion)}&page_size=1`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Image search failed (${response.status})`)
      }

      const data = await response.json()
      const result = data.results && data.results[0]

      if (!result) {
        setImageError('No se encontró una imagen para esta pregunta.')
        return
      }

      setImage({
        url: result.thumbnail || result.url,
        title: result.title || trimmedQuestion,
        creator: result.creator || 'Desconocido',
        sourceUrl: result.foreign_landing_url || result.url,
      })
    } catch (err) {
      setImageError('No se pudo cargar una imagen para esta pregunta.')
    } finally {
      setImageLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || loading) return

    // Fired independently: a slow/failed image lookup never blocks or
    // breaks the actual Claude answer.
    fetchAnswer(trimmed)
    fetchImage(trimmed)
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

            <div className="console__image-block">
              <span className="console__label">Imagen relacionada</span>
              <div className="console__image-frame">
                {imageLoading && (
                    <div className="console__image-placeholder">
                      <span className="spinner" aria-hidden="true" />
                    </div>
                )}
                {!imageLoading && imageError && (
                    <div className="console__image-placeholder console__image-placeholder--error">
                      {imageError}
                    </div>
                )}
                {!imageLoading && !imageError && image && (
                    <img className="console__image" src={image.url} alt={image.title} />
                )}
                {!imageLoading && !imageError && !image && (
                    <div className="console__image-placeholder">
                      La imagen aparecerá aquí.
                    </div>
                )}
              </div>
              {image && !imageLoading && !imageError && (
                  <a
                      className="console__image-credit"
                      href={image.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                  >
                    {image.title} — {image.creator}
                  </a>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}