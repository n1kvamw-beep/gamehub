// Redimensiona e corta ao centro (como o Discord), e converte para WebP leve.
export async function resizeImage(file: File, w: number, h: number): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error("Escolhe uma imagem PNG, JPG, WebP ou GIF.");
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.max(w / bmp.width, h / bmp.height);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/webp", 0.85));
  if (blob && blob.type === "image/webp") return blob;
  const jpg = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!jpg) throw new Error("Não foi possível processar a imagem.");
  return jpg;
}
