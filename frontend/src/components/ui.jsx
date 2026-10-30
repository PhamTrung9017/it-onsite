import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Camera, Check, ChevronRight, ImageIcon, Inbox, Info, Laptop, Monitor, Printer, RefreshCw, Star, X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { STATUS_LABEL, STATUS_TONE } from '../lib/ticketStatus.js';
import { money } from '../lib/format.js';
import { compressImage } from '../lib/image.js';

export function Button({ variant = 'primary', size, block, loading, icon: Icon, children, className = '', ...props }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" aria-hidden /> : Icon && <Icon aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', size, block, icon: Icon, children }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block'].filter(Boolean).join(' ');
  return <Link to={to} className={cls}>{Icon && <Icon aria-hidden />}{children}</Link>;
}

export function Card({ title, action, children, className = '', bodyClass = 'card-body', footer }) {
  return (
    <section className={`card ${className}`}>
      {title && <header className="card-head"><h2>{title}</h2>{action}</header>}
      {children !== undefined && <div className={bodyClass}>{children}</div>}
      {footer && <footer className="card-foot">{footer}</footer>}
    </section>
  );
}

export function Badge({ tone = 'muted', plain, children }) {
  return <span className={`badge tone-${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function PageHead({ title, sub, crumbs, actions }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <nav className="crumb" aria-label="Đường dẫn">
            {crumbs.map((c, i) => (
              <span key={c.label} className="row-sm">
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight aria-hidden />}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon aria-hidden /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ rows = 3 }) {
  return (
    <div className="page-loading" aria-busy="true" aria-label="Đang tải">
      <div className="skeleton" style={{ height: 34, width: '40%' }} />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 88 }} />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <Card>
      <Empty icon={AlertTriangle} title="Không tải được dữ liệu" action={onRetry && <Button variant="outline" icon={RefreshCw} onClick={() => onRetry()}>Thử lại</Button>}>
        {error?.message}
      </Empty>
    </Card>
  );
}

export function Alert({ tone = 'info', title, children, icon: Icon = tone === 'info' ? Info : AlertTriangle }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div>{title && <strong>{title}</strong>}{children}</div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, textarea, select, button.btn')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng"><X /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, size = 16 }) {
  return (
    <span className="stars" aria-label={`${value} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(value) ? '' : 'off'} fill="currentColor" aria-hidden />)}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <div className="row-sm" role="radiogroup" aria-label="Chọn số sao">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} sao`} onClick={() => onChange(i)}
          style={{ border: 0, background: 'none', padding: 2, cursor: 'pointer', color: i <= value ? '#f4a522' : 'var(--line)' }}>
          <Star size={34} fill="currentColor" aria-hidden />
        </button>
      ))}
    </div>
  );
}

const DEVICE_ICON = { Laptop, PC: Monitor, 'Thiết bị khác': Printer };
export function DeviceIcon({ type, size = 20 }) {
  const I = DEVICE_ICON[type] || Laptop;
  return <I size={size} aria-hidden />;
}

export function Money({ value, className = '' }) {
  return <span className={`price ${className}`}>{money(value)}</span>;
}

/** Lưới ảnh có nút thêm ảnh (nén trước khi lưu). */
export function PhotoPicker({ photos, onAdd, onRemove, max = 5, label = 'Thêm ảnh', disabled, onError }) {
  const input = useRef();
  const [working, setWorking] = useState(false);
  async function handle(files) {
    const list = Array.from(files).slice(0, max - photos.length);
    if (files.length > max - photos.length) onError?.(`Chỉ được thêm tối đa ${max} ảnh.`);
    setWorking(true);
    const out = [];
    for (const f of list) {
      try { out.push(await compressImage(f)); } catch (e) { onError?.(e.message); }
    }
    setWorking(false);
    if (out.length) onAdd(out);
    input.current.value = '';
  }
  return (
    <div className="photo-grid">
      {photos.map((p, i) => (
        <div className="photo" key={i}>
          {p === 'mau' ? <div className="photo-placeholder"><ImageIcon aria-hidden /></div> : <img src={p} alt={`Ảnh ${i + 1}`} />}
          {onRemove && !disabled && <button type="button" className="rm" onClick={() => onRemove(i)} aria-label={`Xóa ảnh ${i + 1}`}><X /></button>}
        </div>
      ))}
      {photos.length < max && !disabled && (
        <label className="photo-add">
          {working ? <span className="spinner" style={{ margin: '0 auto' }} /> : <Camera aria-hidden />}
          <span>{label}</span>
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => handle(e.target.files)} />
        </label>
      )}
    </div>
  );
}

export function PhotoGallery({ photos }) {
  if (!photos?.length) return <p className="small muted">Chưa có ảnh.</p>;
  return (
    <div className="photo-grid">
      {photos.map((p, i) => (
        <div className="photo" key={i}>
          {p === 'mau' ? <div className="photo-placeholder"><ImageIcon aria-hidden /></div> : <a href={p} target="_blank" rel="noreferrer"><img src={p} alt={`Ảnh ${i + 1}`} /></a>}
        </div>
      ))}
    </div>
  );
}

export function QRImage({ payload, size = 220 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(payload, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(''));
  }, [payload, size]);
  return <div className="qr-box">{src ? <img src={src} alt="Mã VietQR chuyển khoản" width={size} height={size} /> : <div className="skeleton" style={{ width: size, height: size }} />}</div>;
}

export function CheckItem({ checked, onChange, children, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled} role="checkbox" aria-checked={checked}
      className="row" style={{ width: '100%', border: 0, background: 'none', padding: '10px 0', cursor: disabled ? 'default' : 'pointer', textAlign: 'left' }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${checked ? 'var(--brand-600)' : 'var(--line)'}`, background: checked ? 'var(--brand-600)' : '#fff', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>
        {checked && <Check size={14} strokeWidth={3} aria-hidden />}
      </span>
      <span className="grow">{children}</span>
    </button>
  );
}
