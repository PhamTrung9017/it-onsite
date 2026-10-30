import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../context/AppContext.jsx';

/** Tải dữ liệu khi vào màn hình, có trạng thái đang tải / lỗi và hàm tải lại. */
export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const run = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await loader();
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run]);
  return { data, setData, error, loading, reload: run };
}

/** Thực hiện một thao tác ghi: khóa nút trong lúc chạy, báo lỗi bằng thông báo nổi. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = useCallback(async (key, fn, successMessage) => {
    setBusy(key);
    try {
      const r = await fn();
      if (successMessage) toast.success(successMessage);
      return r === undefined ? true : r;
    } catch (e) {
      toast.error(e.message || 'Đã có lỗi xảy ra, vui lòng thử lại.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return { busy, run };
}

/** Đồng hồ cập nhật mỗi giây (dùng cho đếm ngược thời hạn phản hồi). */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
