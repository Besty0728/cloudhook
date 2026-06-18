/**
 * 配置管理页面
 * 涵盖：Bark 通知、角色/Persona、风控（geo/IP/限流）
 */

import { useEffect, useState, useCallback } from 'react';
import { getConfig, updateConfig, testBarkPush } from '@/api/config';
import { Config } from '@/types/api';
import { Button, Input, TagInput } from '@/components/ui';
import UiverseToggle from '@/components/ui/UiverseToggle';
import { Eye, EyeOff, Bell, UserCircle, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import Toast from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

// ─── 脱敏 bark_key 判断 ────────────────────────────────────────────────────────
// 后端返回形如 xxxx****xxxx，包含 **** 时视为脱敏值，不提交
const IS_MASKED = (v: string) => v.includes('****');

// ─── 测试推送响应（含后端诊断信息）────────────────────────────────────────────
interface TestPushDiagnostics {
  server?: string;
  key_preview?: string;
  key_length?: number;
  key_looks_masked?: boolean;
}
interface TestPushResult {
  success?: boolean;
  message?: string;
  error?: string;
  diagnostics?: TestPushDiagnostics;
}

// 把后端返回的 message + diagnostics 拼成可读的失败原因
function fmtTestError(r: TestPushResult): string {
  const base = r.message || r.error || '未知错误';
  const d = r.diagnostics;
  if (!d) return base;
  const parts: string[] = [];
  if (d.server) parts.push(`服务器 ${d.server}`);
  if (d.key_preview) parts.push(`Key ${d.key_preview}`);
  if (typeof d.key_length === 'number') parts.push(`长度 ${d.key_length}`);
  if (d.key_looks_masked) parts.push('⚠ Key 疑似脱敏值（请清空后重新输入并保存）');
  return parts.length ? `${base}（${parts.join('，')}）` : base;
}

// ─── 区块卡片容器 ─────────────────────────────────────────────────────────────
function SectionCard({
  title,
  icon,
  children,
  onSave,
  saving,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
      {/* 卡片标题栏 */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
              {icon}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{title}</h2>
          </div>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
      {/* 卡片内容 */}
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

// ─── 标签行（label + 子内容横排）────────────────────────────────────────────
function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-gray-700 tracking-wide">{label}</span>
        {hint && <span className="text-xs text-gray-400 tracking-wide">（{hint}）</span>}
      </div>
      {children}
    </div>
  );
}

// ─── IP 模式按钮组 ────────────────────────────────────────────────────────────
const IP_MODES = [
  { value: 'off', label: '关闭' },
  { value: 'allowlist', label: '白名单' },
  { value: 'blocklist', label: '黑名单' },
] as const;

// ─── 主页面组件 ───────────────────────────────────────────────────────────────
export default function ConfigPage() {
  const { toasts, removeToast, success, error: toastError } = useToast();

  // 页面加载状态
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── 1. Bark 通知配置 ──────────────────────────────────────────────────────
  // barkKey 存用户的当前输入；若与后端脱敏原值相同，则不提交
  const [barkKey, setBarkKey] = useState('');
  const [barkKeyOriginal, setBarkKeyOriginal] = useState('');
  const [barkServer, setBarkServer] = useState('');
  const [showBarkKey, setShowBarkKey] = useState(false);
  const [savingBark, setSavingBark] = useState(false);
  const [testingBark, setTestingBark] = useState(false);

  // ── 2. 角色/Persona ───────────────────────────────────────────────────────
  const [personaEnabled, setPersonaEnabled] = useState(false);
  const [personaUserName, setPersonaUserName] = useState('');
  const [savingPersona, setSavingPersona] = useState(false);

  // ── 3. 风控 risk_control ──────────────────────────────────────────────────
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [geoCountries, setGeoCountries] = useState<string[]>([]);
  const [geoRegions, setGeoRegions] = useState<string[]>([]);
  const [ipMode, setIpMode] = useState<'off' | 'allowlist' | 'blocklist'>('off');
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [ipBlocklist, setIpBlocklist] = useState<string[]>([]);
  const [rlEnabled, setRlEnabled] = useState(false);
  const [rlMax, setRlMax] = useState(60);
  const [savingRc, setSavingRc] = useState(false);

  // ─── 从后端加载配置并填充各状态 ────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const cfg: Config = await getConfig();

      // Bark
      setBarkKey(cfg.bark_key ?? '');
      setBarkKeyOriginal(cfg.bark_key ?? '');
      setBarkServer(cfg.bark_server ?? '');

      // Persona
      setPersonaEnabled(cfg.persona?.enabled ?? false);
      setPersonaUserName(cfg.persona?.user_name ?? '');

      // 风控
      setGeoEnabled(cfg.risk_control?.geo?.enabled ?? false);
      setGeoCountries(cfg.risk_control?.geo?.allowed_countries ?? []);
      setGeoRegions(cfg.risk_control?.geo?.allowed_regions ?? []);
      setIpMode(cfg.risk_control?.ip?.mode ?? 'off');
      setIpAllowlist(cfg.risk_control?.ip?.allowlist ?? []);
      setIpBlocklist(cfg.risk_control?.ip?.blocklist ?? []);
      setRlEnabled(cfg.risk_control?.rate_limit?.enabled ?? false);
      setRlMax(cfg.risk_control?.rate_limit?.max_per_minute ?? 60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载配置失败';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ─── 通用保存包装器（统一处理 toast 反馈）──────────────────────────────
  const doSave = async (
    payload: Partial<Config>,
    setSaving: (b: boolean) => void,
    label: string,
  ) => {
    setSaving(true);
    try {
      const res = await updateConfig(payload);
      if (res.success !== false) {
        success(`${label} 已保存`);
      } else {
        toastError(`${label} 保存失败：${res.message ?? '未知错误'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError(`保存失败：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── 各区块保存回调 ────────────────────────────────────────────────────────
  const handleSaveBark = () => {
    // bark_key：若当前值等于脱敏原值（未修改），则不提交该字段
    const payload: Partial<Config> = { bark_server: barkServer };
    if (!IS_MASKED(barkKey) && barkKey !== barkKeyOriginal) {
      payload.bark_key = barkKey;
    }
    doSave(payload, setSavingBark, 'Bark 通知配置');
  };

  const handleTestBark = async () => {
    setTestingBark(true);
    try {
      const res = await testBarkPush();
      // 严格判断：仅当后端明确返回 success === true 才算成功，
      // 避免响应缺字段时（undefined !== false）误报"已发送"
      if (res.success === true) {
        success('测试推送已发送，请检查您的 Bark 通知');
      } else {
        toastError(`测试推送失败：${fmtTestError(res)}`);
      }
    } catch (err: unknown) {
      // 后端失败时返回 HTTP 500，axios 会抛异常 —— 真实信息在 err.response.data 里，
      // 需从中提取后端的 message / diagnostics，而非笼统的 axios 错误文案。
      const data = (err as { response?: { data?: TestPushResult } })?.response?.data;
      const fallback = err instanceof Error ? err.message : String(err);
      toastError(`测试推送失败：${data ? fmtTestError(data) : fallback}`);
    } finally {
      setTestingBark(false);
    }
  };

  const handleSavePersona = () =>
    doSave(
      {
        persona: {
          enabled: personaEnabled,
          user_name: personaUserName,
        },
      },
      setSavingPersona,
      '角色配置',
    );

  const handleSaveRc = () =>
    doSave(
      {
        risk_control: {
          geo: {
            enabled: geoEnabled,
            allowed_countries: geoCountries,
            allowed_regions: geoRegions,
          },
          ip: {
            mode: ipMode,
            allowlist: ipAllowlist,
            blocklist: ipBlocklist,
          },
          rate_limit: {
            enabled: rlEnabled,
            max_per_minute: rlMax,
          },
        },
      },
      setSavingRc,
      '风险控制',
    );

  // ─── 加载中 / 加载失败占位 ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-500">加载配置中…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-600 mb-4">{loadError}</p>
          <Button variant="secondary" onClick={loadConfig}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  // ─── 主渲染 ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* ── 页面标题 ── */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
          配置管理
        </h1>
        <p className="text-gray-600 tracking-wide">管理 Bark 通知、角色、风险控制等全局设置</p>
      </div>

      <div className="space-y-6">

        {/* ── 1. Bark 通知配置 ── */}
        <SectionCard
          title="Bark 通知配置"
          icon={<Bell className="w-5 h-5 text-white" strokeWidth={2.2} />}
          onSave={handleSaveBark}
          saving={savingBark}
        >
          <FieldRow
            label="Bark Key"
            hint="后端返回脱敏值（xxxx****xxxx），重新输入才会更新"
          >
            <div className="relative">
              <Input
                type={showBarkKey ? "text" : "password"}
                value={barkKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBarkKey(e.target.value)}
                placeholder="输入新的 Bark Key 以覆盖"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowBarkKey(!showBarkKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showBarkKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {IS_MASKED(barkKey) && (
              <p className="text-xs text-amber-600 tracking-wide">
                当前显示脱敏值，保存时不会修改 Key。如需更新请清空后重新输入。
              </p>
            )}
          </FieldRow>

          <FieldRow label="Bark Server" hint="留空使用 Bark 官方服务器">
            <Input
              type="url"
              value={barkServer}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBarkServer(e.target.value)}
              placeholder="https://api.day.app"
            />
          </FieldRow>

          <div className="pt-1">
            <Button
              variant="secondary"
              onClick={handleTestBark}
              disabled={testingBark}
            >
              {testingBark ? '发送中…' : '测试推送'}
            </Button>
          </div>
        </SectionCard>

        {/* ── 2. 角色/Persona ── */}
        <SectionCard
          title="角色 / Persona"
          icon={<UserCircle className="w-5 h-5 text-white" strokeWidth={2.2} />}
          onSave={handleSavePersona}
          saving={savingPersona}
        >
          <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-800 tracking-wide">启用角色配置</p>
              <p className="text-xs text-gray-500 mt-0.5 tracking-wide">开启后 AI 将使用自定义人设</p>
            </div>
            <UiverseToggle checked={personaEnabled} onChange={setPersonaEnabled} />
          </div>

          <FieldRow label="用户名称" hint="AI 在通知和消息中称呼您的名字">
            <Input
              value={personaUserName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPersonaUserName(e.target.value)}
              disabled={!personaEnabled}
              placeholder="例：Betsy"
            />
          </FieldRow>
        </SectionCard>

        {/* ── 3. 风险控制（风控）── */}
        <SectionCard
          title="风险控制"
          icon={<ShieldAlert className="w-5 h-5 text-white" strokeWidth={2.2} />}
          onSave={handleSaveRc}
          saving={savingRc}
        >
          {/* 6a. 地理控制 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">地理围栏</span>
            </div>
            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-800 tracking-wide">启用地理限制</p>
                <p className="text-xs text-gray-500 mt-0.5 tracking-wide">仅允许指定国家/地区的请求通过</p>
              </div>
              <UiverseToggle checked={geoEnabled} onChange={setGeoEnabled} />
            </div>
            <FieldRow label="允许的国家" hint="ISO 3166-1 alpha-2 国家码，如 CN US JP">
              <TagInput
                value={geoCountries}
                onChange={setGeoCountries}
                disabled={!geoEnabled}
                placeholder="如 CN US JP"
              />
            </FieldRow>
            <FieldRow label="允许的地区" hint="地区/省份代码，如 CN-BJ">
              <TagInput
                value={geoRegions}
                onChange={setGeoRegions}
                disabled={!geoEnabled}
                placeholder="如 CN-BJ CN-SH"
              />
            </FieldRow>
          </div>

          {/* 6b. IP 控制 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">IP 控制</span>
            </div>
            <FieldRow label="IP 控制模式">
              <div className="flex gap-2">
                {IP_MODES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setIpMode(value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-150 tracking-wide ${
                      ipMode === value
                        ? 'bg-black text-white border-transparent shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>
            {ipMode === 'allowlist' && (
              <FieldRow label="IP 白名单" hint="仅这些 IP 可通过，支持 CIDR">
                <TagInput value={ipAllowlist} onChange={setIpAllowlist} placeholder="如 192.168.1.0/24" />
              </FieldRow>
            )}
            {ipMode === 'blocklist' && (
              <FieldRow label="IP 黑名单" hint="这些 IP 将被拒绝，支持 CIDR">
                <TagInput value={ipBlocklist} onChange={setIpBlocklist} placeholder="如 10.0.0.1" />
              </FieldRow>
            )}
          </div>

          {/* 6c. 限流 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">请求限流</span>
            </div>
            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-800 tracking-wide">启用限流</p>
                <p className="text-xs text-gray-500 mt-0.5 tracking-wide">限制每分钟最大请求次数</p>
              </div>
              <UiverseToggle checked={rlEnabled} onChange={setRlEnabled} />
            </div>
            <FieldRow label="每分钟最大请求数" hint="超出后返回 429">
              <Input
                type="number"
                min={1}
                max={10000}
                value={String(rlMax)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRlMax(Number(e.target.value) || 60)}
                disabled={!rlEnabled}
              />
            </FieldRow>
          </div>
        </SectionCard>

      </div>

      {/* ── Toast 通知渲染 ── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2" style={{ pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <Toast message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
