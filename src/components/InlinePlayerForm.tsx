import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Button } from './Button'

export const PLAYER_NAME_MAX = 24

export type PlayerFormValue = { name: string; isGuest: boolean }

export type InlinePlayerFormProps = {
  initial?: PlayerFormValue
  mode: 'add' | 'edit'
  /** Joueurs screen: after « Ajouter » the input clears and keeps focus so colleagues can be added in bulk. */
  keepOpenAfterAdd?: boolean
  onSubmit: (value: PlayerFormValue) => void
  onCancel: () => void
  /** Names of the other players; compared case- and accent-insensitively. */
  existingNames: string[]
  /** Optional heading, e.g. « Ajoute tes collègues » on an empty Joueurs screen. */
  title?: string
}

// The two helpers below are exported for the Joueurs screen (existingNames) and for unit tests; they hold no
// state, so Fast Refresh keeps working for the component in practice.
/** Lower-case, accent-stripped, trimmed key used for the « Ce nom existe déjà » comparison. */
// oxlint-disable-next-line react/only-export-components
export function normalizePlayerName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr')
}

/** Returns the French validation message, or null when the name is acceptable. `currentName` is skipped (edit mode). */
// oxlint-disable-next-line react/only-export-components
export function validatePlayerName(name: string, existingNames: string[], currentName?: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Entre un nom'
  if (trimmed.length > PLAYER_NAME_MAX) return `${PLAYER_NAME_MAX} caractères max`
  const key = normalizePlayerName(trimmed)
  const current = currentName === undefined ? null : normalizePlayerName(currentName)
  const taken = existingNames.some((other) => {
    const otherKey = normalizePlayerName(other)
    if (current !== null && otherKey === current) return false
    return otherKey === key
  })
  if (taken) return 'Ce nom existe déjà'
  return null
}

export function InlinePlayerForm({
  initial,
  mode,
  keepOpenAfterAdd = false,
  onSubmit,
  onCancel,
  existingNames,
  title,
}: InlinePlayerFormProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [isGuest, setIsGuest] = useState(initial?.isGuest ?? false)
  const [error, setError] = useState<string | null>(null)
  const errorId = `${mode}-player-name-error`

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
    if (error) setError(null)
  }

  const handleCancel = () => {
    inputRef.current?.blur()
    onCancel()
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const currentName = mode === 'edit' ? initial?.name : undefined
    const message = validatePlayerName(name, existingNames, currentName)
    if (message) {
      setError(message)
      inputRef.current?.focus()
      return
    }
    const value: PlayerFormValue = { name: name.trim(), isGuest }
    if (mode === 'add' && keepOpenAfterAdd) {
      setName('')
      setIsGuest(false)
      setError(null)
      onSubmit(value)
      inputRef.current?.focus()
      return
    }
    inputRef.current?.blur()
    onSubmit(value)
  }

  const submitLabel = mode === 'add' ? 'Ajouter' : 'Enregistrer'

  return (
    <form className="inline-form" onSubmit={handleSubmit} noValidate>
      {title && <h2 className="inline-form-title">{title}</h2>}
      <input
        ref={inputRef}
        className="inline-form-input"
        type="text"
        value={name}
        onChange={handleNameChange}
        placeholder="Prénom ou surnom"
        aria-label="Prénom ou surnom"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoCapitalize="words"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={PLAYER_NAME_MAX}
        autoFocus
      />
      {error && (
        <p id={errorId} className="inline-form-error" role="alert">
          {error}
        </p>
      )}
      <label className="inline-form-check">
        <input type="checkbox" checked={isGuest} onChange={(e) => setIsGuest(e.target.checked)} />
        <span className="inline-form-check-text">
          <span className="inline-form-check-label">Invité</span>
          <span className="inline-form-check-caption">Pas un collègue : badge invité dans les listes</span>
        </span>
      </label>
      <div className="inline-form-actions">
        <Button variant="primary" size="md" type="submit">
          {submitLabel}
        </Button>
        <Button variant="text" onClick={handleCancel}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
