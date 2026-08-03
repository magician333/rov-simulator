/**
 * 主菜单：机型选择 + 场景选择（从注册表读取）+ 训练记录页。
 */

import { useState } from 'react';
import { useAppStore } from '../state/store';
import { tr, type DictKey } from '../i18n';
import { listRovs } from '../core/rov/registry';
import { listScenes } from '../render/scenes/BaseScene';
import { exportRecords, useTrainingStore } from '../state/trainingStore';

export function MainMenu() {
  const [page, setPage] = useState<'main' | 'records'>('main');
  return page === 'main' ? (
    <MainPage onRecords={() => setPage('records')} />
  ) : (
    <RecordsPage onBack={() => setPage('main')} />
  );
}

function MainPage({ onRecords }: { onRecords: () => void }) {
  const selectedRovId = useAppStore((s) => s.selectedRovId);
  const selectedSceneId = useAppStore((s) => s.selectedSceneId);
  const selectRov = useAppStore((s) => s.selectRov);
  const selectScene = useAppStore((s) => s.selectScene);
  const startTraining = useAppStore((s) => s.startTraining);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);

  const rov = listRovs();
  const scenes = listScenes();

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>{t('app_title')}</h1>
      <p style={styles.subtitle}>{t('app_subtitle')}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
        {(['zh', 'en', 'es'] as const).map((l) => (
          <button key={l} onClick={() => setLanguage(l)} style={{ ...styles.qualityBtn, ...(language === l ? styles.qualityActive : {}) }}>
            {l === 'zh' ? '简体中文' : l === 'en' ? 'English' : 'Español'}
          </button>
        ))}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>{t('menu_select_rov')}</h2>
        <div style={styles.cards}>
          {rov.map((r) => (
            <button
              key={r.id}
              onClick={() => selectRov(r.id)}
              style={{ ...styles.card, ...(r.id === selectedRovId ? styles.cardActive : {}) }}
            >
              <div style={styles.cardTitle}>{t('rov_' + r.id + '_name' as DictKey)}</div>
              <div style={styles.cardDesc}>{t('rov_' + r.id + '_desc' as DictKey)}</div>
              <div style={styles.cardMeta}>
                {t('menu_max_speed', { v: r.maxSpeedKnots })} · {r.thrusters.length} {t('menu_thrusters')} ·{' '}
                {r.controllableAxes.length} {t('menu_dof')}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>{t('menu_select_scene')}</h2>
        <div style={styles.cards}>
          {scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => selectScene(s.id)}
              style={{ ...styles.card, ...(s.id === selectedSceneId ? styles.cardActive : {}) }}
            >
              <div style={styles.cardTitle}>{t('scene_' + s.id + '_name' as DictKey)}</div>
              <div style={styles.cardDesc}>{t('scene_' + s.id + '_desc' as DictKey)}</div>
              <div style={styles.cardMeta}>
                {t('menu_default_task')}: {t('task_' + s.id + '_name' as DictKey)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={startTraining} style={styles.startBtn}>
          {t('menu_start')} →
        </button>
        <button onClick={onRecords} style={styles.recordsBtn}>
          {t('menu_records')}
        </button>
      </div>

   </div>
  );
}

function RecordsPage({ onBack }: { onBack: () => void }) {
  const records = useTrainingStore((s) => s.records);
  const clearRecords = useTrainingStore((s) => s.clearRecords);
  const language = useAppStore((s) => s.language);
  const t = (k: DictKey, vars?: Record<string, string | number>) => tr(language, k, vars);

  return (
    <div style={styles.root}>
      <h1 style={styles.title}>{t('records_title')}</h1>
      <div style={styles.recordsToolbar}>
        <button onClick={onBack} style={styles.recordsBtn}>← {t('menu_back')}</button>
        <button onClick={() => exportRecords(records)} style={styles.recordsBtn}>{t('records_export')}</button>
        <button
          onClick={() => { if (confirm(t('confirm_clear'))) clearRecords(); }}
          style={{ ...styles.recordsBtn, ...styles.dangerBtn }}
        >
          {t('records_clear')}
        </button>
        <span style={{ color: '#7fb3c9', fontSize: 13 }}>{t('records_count', { n: records.length })}</span>
      </div>

      {records.length === 0 ? (
        <p style={{ color: '#9cc5d9', marginTop: 40 }}>{t('records_empty_hint')}</p>
      ) : (
        <div style={styles.recordsTable}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#8ad5f5', textAlign: 'left' }}>
                <th style={th}>{t('records_col_time')}</th>
                <th style={th}>{t('records_col_scene')}</th>
                <th style={th}>{t('records_col_task')}</th>
                <th style={th}>{t('records_col_status')}</th>
                <th style={th}>{t('records_col_duration')}</th>
                <th style={th}>{t('records_col_maxdepth')}</th>
                <th style={th}>{t('records_col_avgspeed')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={{ color: '#d7eef8' }}>
                  <td style={td}>{new Date(r.date).toLocaleString(language === 'zh' ? 'zh-CN' : language === 'es' ? 'es-ES' : 'en-US')}</td>
                  <td style={td}>{t('scene_' + r.sceneId + '_name' as DictKey)}</td>
                  <td style={td}>{r.taskId}</td>
                  <td style={td}>{r.completed ? '✅ ' + t('records_ok') : '❌ ' + t('records_fail')}</td>
                  <td style={td}>{r.durationSec.toFixed(1)}s</td>
                  <td style={td}>{r.maxDepthM.toFixed(1)}m</td>
                  <td style={td}>{r.avgSpeedKnots.toFixed(2)}kn</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #1a4a63' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #123246' };

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100%', overflowY: 'auto',
    background: 'linear-gradient(160deg, #04121a 0%, #072c3f 60%, #0a3d56 100%)',
    color: '#d7eef8', padding: '48px 32px', boxSizing: 'border-box', textAlign: 'center',
  },
  title: { fontSize: 42, margin: '0 0 4px', letterSpacing: 2 },
  subtitle: { color: '#7fb3c9', margin: '0 0 40px', fontSize: 16 },
  section: { maxWidth: 900, margin: '0 auto 32px' },
  sectionTitle: { fontSize: 18, textAlign: 'left', color: '#a9d3e8', marginBottom: 12 },
  cards: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  card: {
    flex: '1 1 200px', maxWidth: 280, background: 'rgba(10, 45, 66, 0.7)',
    border: '1px solid #1a4a63', borderRadius: 10, padding: 16, color: '#d7eef8',
    cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
  },
  cardActive: {
    borderColor: '#4fc3f7', background: 'rgba(20, 70, 100, 0.85)', boxShadow: '0 0 12px rgba(79, 195, 247, .4)',
  },
  cardTitle: { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#9cc5d9', marginBottom: 8, minHeight: 36 },
  cardMeta: { fontSize: 12, color: '#6f9db5' },
  startBtn: {
    padding: '14px 48px', fontSize: 18, fontWeight: 600, color: '#04121a',
    background: '#4fc3f7', border: 'none', borderRadius: 8, cursor: 'pointer',
  },
  recordsBtn: {
    padding: '10px 24px', fontSize: 14, color: '#d7eef8',
    background: 'rgba(79,195,247,.15)', border: '1px solid #2a6d8f', borderRadius: 8, cursor: 'pointer',
  },
  dangerBtn: { borderColor: '#8a4a3a', background: 'rgba(200,80,60,.15)' },
  qualityBtn: {
    padding: '6px 18px', fontSize: 13, color: '#d7eef8',
    background: 'rgba(79,195,247,.12)', border: '1px solid #2a6d8f', borderRadius: 6, cursor: 'pointer',
  },
  qualityActive: { background: 'rgba(79,195,247,.45)', borderColor: '#4fc3f7' },
  settingRow: { display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  settingLabel: { color: '#7fb3c9', fontSize: 13 },
  recordsToolbar: { display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  recordsTable: { maxWidth: 960, margin: '0 auto', textAlign: 'left', background: 'rgba(10, 45, 66, 0.5)', borderRadius: 10, padding: '8px 16px' },
};
