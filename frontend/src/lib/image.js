/** Thu nhỏ và nén ảnh trước khi tải lên (giảm dung lượng gửi đi). */
export const MAX_PHOTO_MB = 8;

export function compressImage(file, maxSize = 960, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error(`"${file.name}" không phải là ảnh.`)); return; }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) { reject(new Error(`Ảnh "${file.name}" vượt quá ${MAX_PHOTO_MB} MB.`)); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Không đọc được ảnh "${file.name}".`)); };
    img.src = url;
  });
}
