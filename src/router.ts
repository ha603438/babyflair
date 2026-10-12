import { useSyncExternalStore } from 'react'
import type { MatchId, PlayerId } from './types'

export type Route =
  | { name: 'classement' }
  | { name: 'match' }
  | { name: 'match-edit'; id: MatchId }
  | { name: 'historique' }
  | { name: 'match-detail'; id: MatchId }
  | { name: 'joueurs'; add?: boolean }
  | { name: 'joueur'; id: PlayerId }
  | { name: 'reglages' }
  | { name: 'comment-ca-marche' }
  | { name: 'nouveautes' }
  /** Réglages › Journal des modifications (mode partagé). */
  | { name: 'journal' }
  /** Notification click target: Classement with the call's modal open (src/calls/CallWatcher.tsx). */
  | { name: 'appel'; id: string }

const HOME: Route = { name: 'classement' }

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function splitQuery(path: string): { path: string; query: string } {
  const index = path.indexOf('?')
  if (index === -1) return { path, query: '' }
  return { path: path.slice(0, index), query: path.slice(index + 1) }
}

function parseMatch(segments: string[]): Route {
  if (segments.length === 1) return { name: 'match' }
  if (segments.length === 3 && segments[2] === 'modifier') return { name: 'match-edit', id: segments[1] }
  return HOME
}

function parseHistorique(segments: string[]): Route {
  if (segments.length === 1) return { name: 'historique' }
  if (segments.length === 2) return { name: 'match-detail', id: segments[1] }
  return HOME
}

function parseJoueurs(segments: string[], params: URLSearchParams): Route {
  if (segments.length === 2) return { name: 'joueur', id: segments[1] }
  if (segments.length !== 1) return HOME
  if (params.get('add') === '1') return { name: 'joueurs', add: true }
  return { name: 'joueurs' }
}

function parseAppel(segments: string[]): Route {
  if (segments.length === 2) return { name: 'appel', id: segments[1] }
  return HOME
}

function parseSimple(segments: string[], name: 'reglages' | 'comment-ca-marche' | 'nouveautes' | 'journal'): Route {
  if (segments.length === 1) return { name }
  return HOME
}

export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const { path, query } = splitQuery(raw)
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(safeDecode)
  if (segments.length === 0) return HOME
  const params = new URLSearchParams(query)
  switch (segments[0]) {
    case 'match':
      return parseMatch(segments)
    case 'historique':
      return parseHistorique(segments)
    case 'joueurs':
      return parseJoueurs(segments, params)
    case 'reglages':
      return parseSimple(segments, 'reglages')
    case 'comment-ca-marche':
      return parseSimple(segments, 'comment-ca-marche')
    case 'nouveautes':
      return parseSimple(segments, 'nouveautes')
    case 'journal':
      return parseSimple(segments, 'journal')
    case 'appel':
      return parseAppel(segments)
    default:
      return HOME
  }
}

export function hrefOf(route: Route): string {
  switch (route.name) {
    case 'classement':
      return '#/'
    case 'match':
      return '#/match'
    case 'match-edit':
      return `#/match/${encodeURIComponent(route.id)}/modifier`
    case 'historique':
      return '#/historique'
    case 'match-detail':
      return `#/historique/${encodeURIComponent(route.id)}`
    case 'joueurs':
      if (route.add) return '#/joueurs?add=1'
      return '#/joueurs'
    case 'joueur':
      return `#/joueurs/${encodeURIComponent(route.id)}`
    case 'reglages':
      return '#/reglages'
    case 'comment-ca-marche':
      return '#/comment-ca-marche'
    case 'nouveautes':
      return '#/nouveautes'
    case 'journal':
      return '#/journal'
    case 'appel':
      return `#/appel/${encodeURIComponent(route.id)}`
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefOf(route)
}

export function back(): void {
  window.history.back()
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

// useSyncExternalStore needs a referentially stable snapshot while the hash is unchanged,
// otherwise it re-renders forever; cache the last parsed route per hash string.
let cachedHash: string | null = null
let cachedRoute: Route = HOME

function readRoute(): Route {
  if (typeof window === 'undefined') return HOME
  const hash = window.location.hash
  if (hash === cachedHash) return cachedRoute
  cachedHash = hash
  cachedRoute = parseHash(hash)
  return cachedRoute
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute, readRoute)
}
