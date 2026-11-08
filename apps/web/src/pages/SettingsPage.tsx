/**
 * 设置页：常规 / 外观 / 通知 / 引擎能力（真实检测）/ 存储 / 关于 / 危险操作。
 * 所有设置项即时生效（useSettings.update），引擎能力表来自 initEngine() 的真实结果。
 */
import { useCallback, useEffect, useState } from 'react';
import type { FormatId } from '@audio-studio/shared';
import { FORMATS, FORMAT_IDS } from '@audio-studio/shared';
import { useI18n, useT } from '../i18n';
import { useSettings, applyTheme, type ThemeMode } from '../stores/settings';
import { useHistory } from '../stores/history';
import { toast } from '../stores/toast';
import { initEngine } from '../engine';
import { isDesktop, requestNotificationPermission } from '../platform';
import type { EngineCapabilities } from '@audio-studio/shared';
import {
  IconBell, IconCpu, IconShield, IconWarning, IconTrash, IconInfo,
} from '../components/Icons';

const BITRATE_OPTIONS = [64, 96, 128, 160, 192, 224, 256, 320];
const TEMPLATE_TOKENS = '{name} {format} {date} {time} {index} {artist} {title} {album}';

export function SettingsPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const S = lang === 'en' ? EN : ZH;

  const st = useSettings();
  const update = st.update;
  const recordCount = useHistory((s) => s.records.length);

  const [caps, setCaps] = useState<EngineCapabilities | null>(null);
  const [engineErr, setEngineErr] = useState<string | null>(null);
  const [capsLoading, setCapsLoading] = useState(true);
  const [notifPerm, setNotifPerm] = useState<string>(
    isDesktop ? 'granted' : (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'),
  );

  // 初始化引擎并读取真实能力
  useEffect(() => {
    let alive = true;
    setCapsLoading(true);
    initEngine()
      .then((c) => { if (alive) { setCaps(c); setEngineErr(null); } })
      .catch((e) => { if (alive) setEngineErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setCapsLoading(false); });
    return () => { alive = false; };
  }, []);

  // 默认格式选项：仅 canEncode；初始化失败回退全部 13 种
  const formatOptions: FormatId[] = caps
    ? caps.formats.filter((f) => f.canEncode).map((f) => f.id)
    : FORMAT_IDS;

  const savedToast = useCallback((msg?: string) => toast.success(msg ?? S.saved), [S]);

  const onTheme = (mode: ThemeMode) => {
    update({ theme: mode });
    applyTheme(mode);
    savedToast();
  };

  const onLang = (l: 'zh' | 'en') => {
    setLang(l);
    update({ lang: l });
    savedToast();
  };

  const onNotifyPerm = async () => {
    if (isDesktop) { toast.info(S.desktopNotify); return; }
    const ok = await requestNotificationPermission();
    setNotifPerm(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    if (ok) toast.success(S.permGranted);
    else toast.warning(S.permDenied);
  };

  const onClearHistory = () => {
    if (!window.confirm(t('history.clearConfirm'))) return;
    void useHistory.getState().clear().then(() => toast.success(S.historyCleared));
  };

  const onReset = () => {
    if (!window.confirm(S.resetConfirm)) return;
    useSettings.getState().reset();
    applyTheme('dark');
    toast.success(S.resetDone);
  };

  const permLabel = notifPerm === 'granted' ? S.permGranted
    : notifPerm === 'denied' ? S.permDenied
    : notifPerm === 'unsupported' ? S.permUnsupported
    : S.permDefault;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
        </div>
      </div>

      {/* ===== 常规 ===== */}
      <section className="card">
        <div className="card-title">{t('settings.general')}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 'var(--sp-4)',
          }}
        >
          <div className="field">
            <label className="field-label"><span>{t('settings.defaultFormat')}</span></label>
            <select
              className="select"
              value={st.defaultFormat}
              onChange={(e) => { update({ defaultFormat: e.target.value as FormatId }); savedToast(); }}
            >
              {formatOptions.map((id) => (
                <option key={id} value={id}>{FORMATS[id].label}</option>
              ))}
            </select>
            {!caps && !engineErr && (
              <span className="field-hint">{S.capsLoading}</span>
            )}
          </div>

          <div className="field">
            <label className="field-label"><span>{t('settings.defaultBitrate')}</span></label>
            <select
              className="select"
              value={st.defaultBitrateKbps}
              onChange={(e) => { update({ defaultBitrateKbps: Number(e.target.value) }); savedToast(); }}
            >
              {(BITRATE_OPTIONS.includes(st.defaultBitrateKbps)
                ? BITRATE_OPTIONS
                : [st.defaultBitrateKbps, ...BITRATE_OPTIONS].sort((a, b) => a - b)
              ).map((kbps) => (
                <option key={kbps} value={kbps}>{kbps} kbps</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label"><span>{t('settings.concurrency')}</span></label>
            <select
              className="select"
              value={st.concurrency}
              onChange={(e) => { update({ concurrency: Number(e.target.value) }); savedToast(); }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="field-hint">{t('settings.concurrencyHint')}</span>
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label"><span>{t('settings.filenameTemplate')}</span></label>
            <input
              className="input mono"
              value={st.filenameTemplate}
              onChange={(e) => update({ filenameTemplate: e.target.value })}
              onBlur={() => savedToast()}
            />
            <span className="field-hint">{S.tokensHint}: <code>{TEMPLATE_TOKENS}</code></span>
          </div>
        </div>
      </section>

      {/* ===== 外观 ===== */}
      <section className="card">
        <div className="card-title">{S.appearance}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 'var(--sp-4)',
          }}
        >
          <div className="field">
            <label className="field-label"><span>{t('settings.theme')}</span></label>
            <div className="segmented" role="group">
              <button className={st.theme === 'dark' ? 'active' : ''} onClick={() => onTheme('dark')}>
                {t('settings.themeDark')}
              </button>
              <button className={st.theme === 'light' ? 'active' : ''} onClick={() => onTheme('light')}>
                {t('settings.themeLight')}
              </button>
              <button className={st.theme === 'system' ? 'active' : ''} onClick={() => onTheme('system')}>
                {t('settings.themeSystem')}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field-label"><span>{t('settings.language')}</span></label>
            <div className="segmented" role="group">
              <button className={lang === 'zh' ? 'active' : ''} onClick={() => onLang('zh')}>中文</button>
              <button className={lang === 'en' ? 'active' : ''} onClick={() => onLang('en')}>English</button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 通知 ===== */}
      <section className="card">
        <div className="card-title">
          <IconBell size={16} />
          {t('settings.notifications')}
        </div>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          <div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={st.notifyOnDone}
                onChange={(e) => { update({ notifyOnDone: e.target.checked }); savedToast(); }}
              />
              <span>{t('settings.notificationsHint')}</span>
            </label>
            <div className="field-hint mt-2">
              {S.permStatus}: <b style={{ color: notifPerm === 'granted' ? 'var(--success)' : 'var(--fg-2)' }}>{permLabel}</b>
            </div>
          </div>
          {isDesktop ? (
            <span className="field-hint">{S.desktopNotify}</span>
          ) : (
            <button className="btn" onClick={() => void onNotifyPerm()}>
              {t('settings.notificationsEnable')}
            </button>
          )}
        </div>
      </section>

      {/* ===== 引擎 ===== */}
      <section className="card">
        <div className="card-title">
          <IconCpu size={16} />
          {t('settings.engine')}
        </div>

        {capsLoading && (
          <div className="row" style={{ gap: 'var(--sp-3)' }}>
            <span className="spinner" />
            <span className="secondary">{t('engine.initializing')}</span>
          </div>
        )}

        {engineErr && (
          <div className="callout danger">
            <IconWarning size={16} />
            <div>
              <strong>{t('error.loadCore')}</strong>
              <div className="xs mono" style={{ wordBreak: 'break-all' }}>{engineErr}</div>
            </div>
          </div>
        )}

        {caps && (
          <>
            <dl className="kv">
              <dt>{S.engineName}</dt>
              <dd>{caps.engine.name}</dd>
              <dt>{t('settings.engineVersion')}</dt>
              <dd className="mono">{caps.engine.version || '--'}</dd>
              <dt>{t('settings.engineType')}</dt>
              <dd className="mono">{caps.engine.kind}</dd>
              <dt>{t('settings.capabilities')}</dt>
              <dd>{t('settings.capabilitiesCount', { n: caps.encoders.length })}</dd>
            </dl>

            <div className="divider" />
            <div className="bold small mb-3">{t('settings.supportedFormats')}</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{S.colFormat}</th>
                    <th>{S.colEncode}</th>
                    <th>{S.colDecode}</th>
                  </tr>
                </thead>
                <tbody>
                  {caps.formats.map((f) => {
                    const def = FORMATS[f.id];
                    return (
                      <tr key={f.id}>
                        <td>
                          <span className="row" style={{ gap: 'var(--sp-2)' }}>
                            <b>{def.label}</b>
                            <span className="xs muted mono">{f.id}</span>
                          </span>
                        </td>
                        <td>
                          {f.canEncode ? (
                            <span className="badge badge-success">
                              <span className="dot" />
                              {S.encodeOk}
                            </span>
                          ) : (
                            <span className="badge badge-danger" title={f.reason}>
                              {S.encodeNo}{f.reason ? `（${f.reason}）` : ''}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${f.canDecode ? 'badge-success' : ''}`}>
                            {f.canDecode ? S.decodeOk : S.decodeNo}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ===== 存储 ===== */}
      <section className="card">
        <div className="card-title">
          <IconTrash size={16} />
          {t('settings.storage')}
        </div>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          <span className="small secondary">
            {t('settings.clearHistory')} · {S.recordCount.replace('{n}', String(recordCount))}
          </span>
          <button className="btn btn-danger" onClick={onClearHistory}>
            {t('settings.clearHistory')}
          </button>
        </div>
      </section>

      {/* ===== 关于 ===== */}
      <section className="card">
        <div className="card-title">
          <IconInfo size={16} />
          {t('settings.about')}
        </div>
        <dl className="kv">
          <dt>{t('settings.version')}</dt>
          <dd className="mono">{__APP_VERSION__}</dd>
          <dt>{t('settings.privacy')}</dt>
          <dd style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-2)' }}>{t('settings.privacyText')}</dd>
          <dt>{t('settings.licenses')}</dt>
          <dd style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-2)' }}>{t('settings.licensesText')}</dd>
        </dl>
      </section>

      {/* ===== 危险操作 ===== */}
      <section className="card" style={{ borderColor: 'var(--danger)' }}>
        <div className="card-title" style={{ color: 'var(--danger)' }}>
          <IconWarning size={16} />
          {t('settings.dangerZone')}
        </div>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          <span className="small secondary">{S.resetHint}</span>
          <button className="btn btn-danger" onClick={onReset}>
            {t('settings.resetDefaults')}
          </button>
        </div>
      </section>

      {/* 引擎初始化失败时的重试入口 */}
      {engineErr && !capsLoading && (
        <button
          className="btn"
          onClick={() => {
            setCapsLoading(true);
            initEngine()
              .then((c) => { setCaps(c); setEngineErr(null); })
              .catch((e) => setEngineErr(e instanceof Error ? e.message : String(e)))
              .finally(() => setCapsLoading(false));
          }}
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

const ZH = {
  appearance: '外观',
  saved: '已保存',
  tokensHint: '可用 token',
  capsLoading: '引擎能力检测中…',
  engineName: '引擎名称',
  colFormat: '格式',
  colEncode: '编码输出',
  colDecode: '解码输入',
  encodeOk: '可用',
  encodeNo: '不可用',
  decodeOk: '支持',
  decodeNo: '不支持',
  permStatus: '通知权限',
  permGranted: '已授权',
  permDenied: '已拒绝',
  permDefault: '未授权',
  permUnsupported: '此环境不支持',
  desktopNotify: '桌面版走系统通知，无需浏览器权限',
  historyCleared: '历史已清空',
  recordCount: '{n} 条记录',
  resetConfirm: '确定恢复全部默认设置？',
  resetDone: '已恢复默认设置',
  resetHint: '将重置所有设置项为出厂默认（历史记录不受影响）',
};

const EN: typeof ZH = {
  appearance: 'Appearance',
  saved: 'Saved',
  tokensHint: 'Available tokens',
  capsLoading: 'Detecting engine capabilities…',
  engineName: 'Engine name',
  colFormat: 'Format',
  colEncode: 'Encode',
  colDecode: 'Decode',
  encodeOk: 'Available',
  encodeNo: 'Unavailable',
  decodeOk: 'Supported',
  decodeNo: 'Not supported',
  permStatus: 'Notification permission',
  permGranted: 'Granted',
  permDenied: 'Denied',
  permDefault: 'Not granted',
  permUnsupported: 'Not supported here',
  desktopNotify: 'Desktop uses system notifications — no browser permission needed',
  historyCleared: 'History cleared',
  recordCount: '{n} records',
  resetConfirm: 'Reset all settings to defaults?',
  resetDone: 'Settings reset to defaults',
  resetHint: 'Resets every setting to its default (history is kept)',
};

export default SettingsPage;
