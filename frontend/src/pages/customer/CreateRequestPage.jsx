import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Laptop, Monitor, Plus, Printer, RefreshCw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth, useNotifications, useToast } from '../../context/AppContext.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../services/api.js';
import { Alert, Badge, Button, Card, ErrorState, Field, Loading, Money, PageHead, PhotoPicker } from '../../components/ui.jsx';
import { combineDateTime, money, timeSlots, toDateInput } from '../../lib/format.js';
import { validateSlot } from '../../lib/rules.js';
import { URGENCY_LABEL } from '../../lib/classifier.js';

const TYPES = [
  { value: 'Laptop', icon: Laptop },
  { value: 'PC', icon: Monitor },
  { value: 'Thiết bị khác', icon: Printer },
];
const STEPS = ['Thiết bị và sự cố', 'Dịch vụ gợi ý', 'Lịch hẹn và xác nhận'];

function Stepper({ step }) {
  return (
    <div className="stepper" aria-label={`Bước ${step + 1} trên ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: 'contents' }}>
          <div className={`step${i === step ? ' on' : i < step ? ' done' : ''}`}><span className="num">{i + 1}</span><span className="lbl">{s}</span></div>
          {i < STEPS.length - 1 && <span className="bar" />}
        </div>
      ))}
    </div>
  );
}

export default function CreateRequestPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { refresh } = useNotifications();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(async () => {
    const [catalog, devices] = await Promise.all([api.getCatalog(), api.listDevices()]);
    return { ...catalog, devices };
  }, []);
  const [step, setStep] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [newDevice, setNewDevice] = useState({ type: 'Laptop', brand: '', model: '', note: '' });
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [classifiedFor, setClassifiedFor] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [address, setAddress] = useState(user.address || '');
  const [ward, setWard] = useState(user.ward || '');
  const [date, setDate] = useState(toDateInput(Date.now() + 86400000));
  const [time, setTime] = useState('09:00');
  const [credentials, setCredentials] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data?.devices.length && !deviceId) setDeviceId(data.devices[0].id);
    if (data && !data.devices.length) setDeviceId('new');
  }, [data, deviceId]);

  const slots = useMemo(() => data ? timeSlots(data.config.serviceHours.start, data.config.serviceHours.end) : [], [data]);
  const slotStart = combineDateTime(date, time);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const chosenCategory = data.categories.find((c) => c.code === categoryCode);
  const chosenService = chosenCategory && data.services.find((s) => s.id === chosenCategory.serviceId);

  async function runClassify() {
    setAiBusy(true);
    setAi(null);
    setClassifiedFor(description);
    try {
      // NFR-03: quá 10 giây thì bỏ qua gợi ý, không chặn việc tạo phiếu
      const result = await Promise.race([
        api.classifyIssue({ description }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ]);
      setAi(result);
      setCategoryCode(result.categoryCode);
    } catch {
      setAi({ state: 'failed' });
      setCategoryCode('KHAC');
    } finally {
      setAiBusy(false);
    }
  }

  function validateStep0() {
    const e = {};
    if (deviceId === 'new' && (!newDevice.brand.trim() || !newDevice.model.trim())) e.device = 'Vui lòng nhập hãng và dòng máy.';
    if (description.trim().length < 10) e.description = 'Mô tả sự cố cần ít nhất 10 ký tự.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  function validateStep2() {
    const e = {};
    if (!address.trim()) e.address = 'Vui lòng nhập số nhà, tên đường.';
    if (!ward) e.ward = 'Vui lòng chọn phường.';
    const slotErr = validateSlot(slotStart, data.config);
    if (slotErr) e.slot = slotErr;
    if (!terms || !privacy) e.consent = 'Vui lòng đồng ý điều khoản dịch vụ và xử lý dữ liệu cá nhân.';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function next() {
    if (step === 0) {
      if (!validateStep0()) return;
      setStep(1);
      if (classifiedFor !== description) runClassify();
    } else if (step === 1) {
      setStep(2);
    }
  }

  async function submit() {
    if (!validateStep2()) return;
    setSubmitting(true);
    try {
      let devId = deviceId;
      if (deviceId === 'new') {
        const d = await api.addDevice(newDevice);
        devId = d.id;
      }
      const aiResult = ai && ai.state !== 'failed'
        ? { categoryCode: ai.categoryCode, confidence: ai.confidence, urgency: ai.urgency, reason: ai.reason, state: ai.state, promptVersion: ai.promptVersion, ms: ai.ms }
        : { state: 'failed' };
      const t = await api.createTicket({
        deviceId: devId, description: description.trim(), photos, address: address.trim(), ward, slotStart,
        categoryCode, aiResult, deviceCredentials: credentials.trim(), acceptTerms: terms, acceptPrivacy: privacy,
      });
      refresh();
      toast.success(`Đã tạo phiếu ${t.id}. Điều phối viên sẽ phân công kỹ thuật viên sớm.`);
      navigate(`/khach/phieu/${t.id}`, { replace: true });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="narrow" style={{ width: '100%', maxWidth: 760 }}>
      <PageHead title="Đặt lịch hỗ trợ" sub="Mô tả sự cố, chọn giờ hẹn, kỹ thuật viên sẽ đến tận nơi" />
      <div className="stack">
        <Stepper step={step} />

        {step === 0 && (
          <Card>
            <div className="stack">
              <div className="field">
                <span className="label">Thiết bị cần hỗ trợ</span>
                <div className="choice-grid">
                  {data.devices.map((d) => (
                    <button key={d.id} type="button" className="choice" aria-pressed={deviceId === d.id} onClick={() => setDeviceId(d.id)}>
                      {d.type === 'PC' ? <Monitor aria-hidden /> : d.type === 'Laptop' ? <Laptop aria-hidden /> : <Printer aria-hidden />}
                      <span className="t">{d.brand} {d.model}</span>
                      <span className="s">{d.type}</span>
                    </button>
                  ))}
                  <button type="button" className="choice" aria-pressed={deviceId === 'new'} onClick={() => setDeviceId('new')}>
                    <Plus aria-hidden /><span className="t">Thiết bị khác</span><span className="s">Thêm thiết bị mới</span>
                  </button>
                </div>
              </div>
              {deviceId === 'new' && (
                <div className="stack-sm" style={{ padding: 16, background: 'var(--bg)', borderRadius: 12 }}>
                  <div className="segmented" role="group" aria-label="Loại thiết bị">
                    {TYPES.map(({ value, icon: I }) => (
                      <button key={value} type="button" aria-pressed={newDevice.type === value} onClick={() => setNewDevice({ ...newDevice, type: value })}><I size={16} aria-hidden />{value}</button>
                    ))}
                  </div>
                  <div className="grid-2">
                    <Field label="Hãng" htmlFor="brand"><input id="brand" className="input" placeholder="Ví dụ: Dell" value={newDevice.brand} onChange={(e) => setNewDevice({ ...newDevice, brand: e.target.value })} /></Field>
                    <Field label="Dòng máy" htmlFor="model"><input id="model" className="input" placeholder="Ví dụ: Inspiron 15 3520" value={newDevice.model} onChange={(e) => setNewDevice({ ...newDevice, model: e.target.value })} /></Field>
                  </div>
                  <Field label="Ghi chú thiết bị (không bắt buộc)" htmlFor="dnote"><input id="dnote" className="input" maxLength={255} placeholder="Ví dụ: máy đặt ở phòng kế toán, tầng 2" value={newDevice.note} onChange={(e) => setNewDevice({ ...newDevice, note: e.target.value })} /></Field>
                  {errors.device && <span className="small" style={{ color: 'var(--danger)' }}>{errors.device}</span>}
                </div>
              )}
              <Field label="Mô tả sự cố" htmlFor="desc" error={errors.description} hint={`${description.trim().length} ký tự · càng chi tiết, kỹ thuật viên càng chuẩn bị đúng`}>
                <textarea id="desc" className="textarea" aria-invalid={Boolean(errors.description)} value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ví dụ: Máy khởi động rất chậm, hay hiện quảng cáo lạ, muốn cài lại Windows 11 và giữ dữ liệu ổ D." />
              </Field>
              <div className="field">
                <span className="label">Ảnh hiện trạng (không bắt buộc, tối đa 5 ảnh)</span>
                <PhotoPicker photos={photos} onAdd={(xs) => setPhotos([...photos, ...xs])} onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))} max={5} onError={toast.error} />
                <span className="hint">Không chụp mật khẩu, giấy tờ tùy thân hay dữ liệu nhạy cảm.</span>
              </div>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card title="Gợi ý loại sự cố và dịch vụ" action={!aiBusy && <Button variant="ghost" size="sm" icon={RefreshCw} onClick={runClassify}>Phân tích lại</Button>}>
            <div className="stack">
              {aiBusy && (
                <div className="row" style={{ padding: 16, background: 'var(--brand-50)', borderRadius: 12 }}>
                  <span className="spinner" style={{ color: 'var(--brand-600)' }} />
                  <span className="small">Đang phân tích mô tả sự cố…</span>
                </div>
              )}
              {ai?.state === 'failed' && <Alert tone="warning" title="Chưa gợi ý được">Bạn chọn loại sự cố bên dưới, điều phối viên sẽ xác nhận lại.</Alert>}
              {ai && ai.state !== 'failed' && (
                <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--brand-200)', background: 'linear-gradient(180deg, var(--brand-50), #fff)' }} className="stack-sm">
                  <div className="row-between wrap">
                    <span className="row-sm strong"><Sparkles size={18} color="var(--brand-600)" aria-hidden />{ai.category.name}</span>
                    <Badge tone={ai.state === 'ok' ? 'success' : 'warning'} plain>Độ tin cậy {Math.round(ai.confidence * 100)}%</Badge>
                  </div>
                  <p className="small muted">Mức khẩn ước tính: {URGENCY_LABEL[ai.urgency]}. {ai.reason}</p>
                  {ai.redacted && <p className="tiny muted">Thông tin cá nhân trong mô tả đã được ẩn trước khi phân tích.</p>}
                </div>
              )}
              <Field label="Loại sự cố" htmlFor="cat" hint="Bạn có thể chọn lại nếu gợi ý chưa đúng">
                <select id="cat" className="select" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}>
                  <option value="" disabled>Chọn loại sự cố</option>
                  {data.categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </Field>
              {chosenService && (
                <div className="row-between" style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg)' }}>
                  <div>
                    <div className="strong">{chosenService.name}</div>
                    <div className="tiny muted">{chosenService.durationMin} phút · {chosenService.warrantyDays ? `bảo hành ${chosenService.warrantyDays} ngày` : 'không bảo hành'}</div>
                  </div>
                  <div className="right"><div className="tiny muted">Giá tham khảo từ</div><Money value={chosenService.price} /></div>
                </div>
              )}
              <p className="tiny muted">Gợi ý chỉ để tham khảo. Giá chính thức là báo giá kỹ thuật viên gửi sau khi khảo sát, bạn duyệt rồi mới thực hiện.</p>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <div className="stack">
              <div className="grid-2">
                <Field label="Số nhà, tên đường" htmlFor="addr" error={errors.address}><input id="addr" className="input" aria-invalid={Boolean(errors.address)} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ví dụ: 120 Nguyễn Trãi" /></Field>
                <Field label="Phường" htmlFor="ward" error={errors.ward}>
                  <select id="ward" className="select" value={ward} onChange={(e) => setWard(e.target.value)}>
                    <option value="">Chọn phường</option>
                    {data.config.areas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Ngày hẹn" htmlFor="date"><input id="date" type="date" className="input" min={toDateInput(Date.now())} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Khung giờ" htmlFor="time">
                  <select id="time" className="select" value={time} onChange={(e) => setTime(e.target.value)}>
                    {slots.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              {errors.slot && <Alert tone="danger">{errors.slot}</Alert>}
              <Field label="Thông tin đăng nhập máy (nếu cần)" htmlFor="cred" hint="Được mã hóa, chỉ kỹ thuật viên phụ trách xem được và tự xóa khi phiếu kết thúc.">
                <input id="cred" className="input" autoComplete="off" value={credentials} onChange={(e) => setCredentials(e.target.value)} placeholder="Ví dụ: mật khẩu Windows" />
              </Field>
              <Alert tone="warning" title={`Phí khảo sát ${money(data.config.surveyFee)}`} icon={ShieldCheck}>
                Miễn phí khi bạn duyệt báo giá; chỉ thu khi bạn từ chối sửa sau khi kỹ thuật viên đã kiểm tra.
                Hủy hoặc đổi lịch miễn phí trước giờ hẹn ít nhất {data.config.freeCancelHours} giờ.
              </Alert>
              <div className="stack-sm">
                <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>Tôi đồng ý điều khoản dịch vụ, chính sách phí khảo sát và hủy, đổi lịch.</span></label>
                <label className="check"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /><span>Tôi đồng ý cho IT OnSite xử lý thông tin liên hệ, địa chỉ và mô tả sự cố để thực hiện yêu cầu này.</span></label>
                {errors.consent && <span className="small" style={{ color: 'var(--danger)' }}>{errors.consent}</span>}
              </div>
            </div>
          </Card>
        )}

        <div className="row-between">
          {step > 0 ? <Button variant="outline" icon={ArrowLeft} onClick={() => setStep(step - 1)}>Quay lại</Button> : <span />}
          {step < 2
            ? <Button onClick={next} disabled={step === 1 && (aiBusy || !categoryCode)}>Tiếp tục <ArrowRight size={18} aria-hidden /></Button>
            : <Button variant="accent" icon={Send} loading={submitting} onClick={submit}>Gửi yêu cầu</Button>}
        </div>
      </div>
    </div>
  );
}
