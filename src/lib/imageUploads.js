const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

const previewCache = new Map()

export function isHeicLike(fileOrName, mimeType = '') {
  if (!fileOrName && !mimeType) return false
  const name = typeof fileOrName === 'string'
    ? fileOrName
    : String(fileOrName?.name || '')
  const type = String(
    typeof fileOrName === 'object' && fileOrName?.type
      ? fileOrName.type
      : mimeType || ''
  ).toLowerCase()
  return HEIC_MIME_TYPES.has(type) || /\.(heic|heif)(?:$|[?#])/i.test(name)
}

export async function convertHeicBlob(blob, quality = 0.9) {
  const module = await import('heic2any')
  const heic2any = module.default || module
  const converted = await heic2any({
    blob,
    toType: 'image/jpeg',
    quality,
  })
  const result = Array.isArray(converted) ? converted[0] : converted
  if (!(result instanceof Blob)) throw new Error('HEIC 변환 결과가 올바르지 않아요.')
  return result
}

export async function normalizeUploadFile(file, {
  allowPdf = false,
  maxSourceBytes = 20 * 1024 * 1024,
  maxOutputBytes = 12 * 1024 * 1024,
  quality = 0.9,
} = {}) {
  if (!file) throw new Error('파일을 선택해주세요.')

  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(String(file.name || ''))
  const image = file.type?.startsWith('image/') || isHeicLike(file)
  if (!(image || (allowPdf && pdf))) {
    throw new Error(`${file.name || '파일'}: ${allowPdf ? '이미지 또는 PDF' : '이미지'}만 사용할 수 있어요.`)
  }

  if (file.size > maxSourceBytes) {
    throw new Error(`${file.name || '파일'}: 원본 파일은 ${Math.round(maxSourceBytes / 1024 / 1024)}MB 이하만 선택할 수 있어요.`)
  }

  if (!isHeicLike(file)) {
    if (file.size > maxOutputBytes) {
      throw new Error(`${file.name || '파일'}: 파일은 ${Math.round(maxOutputBytes / 1024 / 1024)}MB 이하만 올릴 수 있어요.`)
    }
    return file
  }

  try {
    const blob = await convertHeicBlob(file, quality)
    if (blob.size > maxOutputBytes) {
      throw new Error(`변환된 사진이 ${Math.round(maxOutputBytes / 1024 / 1024)}MB를 넘어요.`)
    }
    const base = String(file.name || 'photo.heic').replace(/\.(heic|heif)$/i, '') || 'photo'
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch (error) {
    if (/MB를 넘어요/.test(error?.message || '')) throw error
    console.error('HEIC/HEIF conversion failed', error)
    throw new Error('HEIC/HEIF 사진을 변환하지 못했어요. 다른 사진을 고르거나 JPG로 변환한 뒤 다시 시도해주세요.')
  }
}

export async function previewableImageUrl({
  url,
  fileName = '',
  mimeType = '',
  cacheKey = '',
} = {}) {
  if (!url) return null
  if (!isHeicLike(fileName || url, mimeType)) return url

  const key = cacheKey || url
  if (previewCache.has(key)) return previewCache.get(key)

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('사진 원본을 불러오지 못했어요.')
    const source = await response.blob()
    const converted = await convertHeicBlob(source, 0.88)
    const objectUrl = URL.createObjectURL(converted)
    previewCache.set(key, objectUrl)
    return objectUrl
  } catch (error) {
    console.warn('Stored HEIC/HEIF preview conversion failed', error)
    return null
  }
}
