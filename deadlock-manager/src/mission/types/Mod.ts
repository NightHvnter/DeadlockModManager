export interface Mod {
  id: string
  remoteId: string
  name: string
  description: string | null
  remoteUrl: string
  category: string
  likes: number
  author: string
  modAuthorId?: string | null
  downloadable?: boolean
  remoteAddedAt: string
  remoteUpdatedAt: string
  tags: string[]
  images: string[]
  thumbnailUrl?: string | null
  hero: string | null
  isAudio: boolean
  isMap?: boolean
  audioUrl: string | null
  downloadCount: number
  isNSFW: boolean
  filesUpdatedAt: string | null
  metadata?: ModMetadata | null
  dependencies?: ModDependency[] | null
  createdAt: string | null
  updatedAt: string | null
}

export interface ModMetadata {
  mapName?: string
  donationLinks?: { url: string; platform: string }[]
}

export interface ModDependency {
  label: string
  url: string | null
  remoteId: string | null
  level: 'required' | 'recommended' | null
}

export interface ModDownload {
  url: string
  size: number
  name: string
  md5Checksum: string | null
}