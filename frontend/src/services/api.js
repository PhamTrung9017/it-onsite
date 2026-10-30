/**
 * Điểm truy cập API duy nhất của giao diện.
 * Có biến môi trường VITE_API_URL thì gọi backend thật, không có thì dùng API giả lập lưu trong trình duyệt.
 */
import { httpApi } from './http/httpApi.js';
import { mockApi } from './mock/mockApi.js';

export const usingMockApi = !import.meta.env.VITE_API_URL;
export const api = usingMockApi ? mockApi : httpApi;
export { ApiError } from './apiError.js';
