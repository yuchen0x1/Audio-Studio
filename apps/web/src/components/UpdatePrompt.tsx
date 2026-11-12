import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { isDesktop, installDesktopUpdate, refreshWebUpdate, relaunchDesktop } from '../platform';
import { getAvailableRelease, subscribeToAvailableRelease, type LatestRelease } from '../updates';
import { Modal } from './Modal';

type UpdateState = 'available' | 'installing' | 'error';

function formatAssetSize(sizeBytes: number | null): string {
  if (sizeBytes === null || sizeBytes < 0) return '';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = sizeBytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

/** 全局版本更新弹窗：Web 刷新 Service Worker，桌面端下载签名安装包并重启。 */
export function UpdatePrompt() {
  const t = useT();
  const [release, setRelease] = useState<LatestRelease | null>(() => getAvailableRelease());
  const [state, setState] = useState<UpdateState>('available');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(
    () =>
      subscribeToAvailableRelease((next) => {
        if (!next.hasUpdate) return;
        setRelease(next);
        setState('available');
        setProgress(null);
        setError(false);
      }),
    [],
  );

  const close = () => {
    if (state !== 'installing') setRelease(null);
  };

  const install = async () => {
    if (!release || state === 'installing') return;
    setState('installing');
    setError(false);
    setProgress(0);
    try {
      if (isDesktop) {
        const installed = await installDesktopUpdate(setProgress);
        if (!installed) throw new Error('没有找到可安装的桌面更新包');
        await relaunchDesktop();
        return;
      }
      await refreshWebUpdate(setProgress);
    } catch {
      setState('error');
      setError(true);
      setProgress(null);
    }
  };

  if (!release) return null;

  const percent = progress === null ? null : Math.round(progress * 100);
  const title =
    state === 'installing'
      ? t('updates.installing')
      : state === 'error'
        ? t('updates.installFailed')
        : t('updates.available', { version: release.tagName });

  return (
    <Modal
      open
      title={title}
      onClose={close}
      width={560}
      footer={
        <div className="row-between" style={{ width: '100%', gap: 'var(--sp-3)' }}>
          <button className="btn btn-ghost" onClick={close} disabled={state === 'installing'}>
            {state === 'error' ? t('common.close') : t('updates.later')}
          </button>
          {state === 'error' ? (
            <button className="btn btn-primary" onClick={() => void install()}>
              {t('common.retry')}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => void install()}
              disabled={state === 'installing'}
            >
              {state === 'installing' ? t('updates.installing') : t('updates.installNow')}
            </button>
          )}
        </div>
      }
    >
      {state === 'installing' ? (
        <div className="empty" role="status" aria-live="polite">
          <span className="spinner" />
          <div className="empty-title">
            {isDesktop ? t('updates.downloading') : t('updates.refreshing')}
          </div>
          {percent !== null && <div className="field-hint">{percent}%</div>}
          <div className="field-hint">{t('updates.keepOpen')}</div>
        </div>
      ) : state === 'error' || error ? (
        <div className="callout danger" role="alert">
          <div>
            <strong>{t('updates.installFailed')}</strong>
            <div className="field-hint">
              {isDesktop ? t('updates.desktopInstallHint') : t('updates.webRefreshHint')}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="row-between" style={{ gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
            <div>
              <div className="bold">
                {t('updates.latestVersion')}: {release.tagName}
              </div>
              {release.publishedAt && (
                <div className="field-hint">
                  {t('updates.publishedAt')}:{' '}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                    new Date(release.publishedAt),
                  )}
                </div>
              )}
            </div>
            <span className="badge badge-success">{t('updates.availableBadge')}</span>
          </div>
          <div className="divider" />
          <div className="small bold mb-2">{t('updates.releaseNotes')}</div>
          <pre
            className="small secondary"
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontFamily: 'inherit',
              maxHeight: 220,
              overflowY: 'auto',
              margin: 0,
            }}
          >
            {release.body || t('updates.noReleaseNotes')}
          </pre>
          {release.assets.length > 0 && (
            <div className="field-hint" style={{ marginTop: 'var(--sp-3)' }}>
              <div className="small bold">{t('updates.assets')}</div>
              <ul style={{ margin: 'var(--sp-1) 0 0', paddingLeft: 'var(--sp-4)' }}>
                {release.assets.map((asset) => (
                  <li key={`${asset.name}-${asset.downloadUrl}`}>
                    {asset.name}
                    {asset.sizeBytes !== null ? ` · ${formatAssetSize(asset.sizeBytes)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="field-hint" style={{ marginBottom: 0, marginTop: 'var(--sp-3)' }}>
            {isDesktop ? t('updates.desktopInstallHint') : t('updates.webRefreshHint')}
          </p>
        </>
      )}
    </Modal>
  );
}
