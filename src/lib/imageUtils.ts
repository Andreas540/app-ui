export function cropToSquare(file: File, targetSize = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = targetSize
        canvas.height = targetSize
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not available')); return }
        ctx.drawImage(
          img,
          (img.width - size) / 2,
          (img.height - size) / 2,
          size, size,
          0, 0,
          targetSize, targetSize,
        )
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
