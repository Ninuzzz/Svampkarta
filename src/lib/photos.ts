import { createStore, del, get, set } from 'idb-keyval'
import { useEffect, useState } from 'react'
import { uid } from './store'

/** Foton ligger i IndexedDB – localStorage räcker inte för bilder. */
const photoStore = createStore('skogsdagbok-photos', 'photos')

const MAX_EDGE = 1600

/** Skalar ner och komprimerar en bild till WebP/JPEG innan den sparas. */
export async function savePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Kunde inte komprimera bilden'))), 'image/webp', 0.82),
  )
  const id = uid()
  await set(id, blob, photoStore)
  return id
}

export const deletePhoto = (id: string) => del(id, photoStore)

export function usePhotoUrl(id: string | undefined) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!id) return
    let objectUrl: string | undefined
    let cancelled = false
    get<Blob>(id, photoStore).then((blob) => {
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])
  return url
}
