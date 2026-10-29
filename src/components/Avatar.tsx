import { useState } from 'react'
import type { CSSProperties } from 'react'
import { initialsOf } from '../avatar'
import type { Player } from '../types'

export type AvatarProps = { player: Player; size: number }

/**
 * Round player photo (the Slack picture, src/avatar.ts), or the initials when there is none or it fails to load.
 * Decorative: the name always sits next to it. No referrer, so the photo host does not learn where it is shown.
 */
export function Avatar({ player, size }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const style = { '--avatar-size': `${size}px` } as CSSProperties
  const url = player.photoUrl
  if (url !== undefined && url !== failedUrl) {
    return (
      <img
        className="avatar"
        style={style}
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    )
  }
  return (
    <span className="avatar avatar--initials" style={style} aria-hidden="true">
      {initialsOf(player.name)}
    </span>
  )
}
