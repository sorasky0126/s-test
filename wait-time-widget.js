/**
 * wait-time-widget.js
 * ───────────────────────────────────────────────────────────────
 * 既存サイトの HTML を一切変更せずに待ち時間ウィジェットを表示します。
 *
 * 【使い方】以下の1行を </body> 直前に貼るだけ：
 *
 *   <script
 *     src="wait-time-widget.js"
 *     data-store-id="1"
 *     data-supabase-url="https://YOUR_PROJECT_ID.supabase.co"
 *     data-supabase-key="YOUR_ANON_PUBLIC_KEY"
 *     data-position="bottom-right"
 *   ></script>
 *
 * オプション属性（data-*）
 *   data-store-id     : wait_times テーブルの store_id（必須）
 *   data-supabase-url : Supabase プロジェクト URL（必須）
 *   data-supabase-key : Supabase anon/public キー（必須）
 *   data-position     : bottom-right(既定) / bottom-left / top-right / top-left
 * ───────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // ── 1. script タグから設定を読む ────────────────────────────
  const scriptEl = document.currentScript ||
    document.querySelector('script[data-store-id]');

  const SUPABASE_URL = scriptEl.dataset.supabaseUrl;
  const SUPABASE_KEY = scriptEl.dataset.supabaseKey;
  const STORE_ID     = scriptEl.dataset.storeId;
  const POSITION     = scriptEl.dataset.position || 'bottom-right';
  const INTERVAL_MS  = 5000; // 5秒ごとにポーリング

  if (!SUPABASE_URL || !SUPABASE_KEY || !STORE_ID) {
    console.warn('[wait-time-widget] data-supabase-url / data-supabase-key / data-store-id が必要です');
    return;
  }

  // ── 2. Supabase SDK を動的に読み込む ────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── 3. CSS を注入 ────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('wt-styles')) return;
    const posMap = {
      'bottom-right': 'bottom:24px;right:24px',
      'bottom-left' : 'bottom:24px;left:24px',
      'top-right'   : 'top:24px;right:24px',
      'top-left'    : 'top:24px;left:24px',
    };
    const posCSS = posMap[POSITION] || posMap['bottom-right'];
    const alignSelf = POSITION.includes('right') ? 'margin-left:auto' : 'margin-right:auto';

    const css = `
      #wt-root {
        position: fixed;
        ${posCSS};
        z-index: 99999;
        width: 260px;
        font-family: 'Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif;
      }
      #wt-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #e8600a;
        color: #fff;
        border: none;
        border-radius: 999px;
        padding: 10px 18px 10px 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(232,96,10,.35);
        transition: transform .15s, box-shadow .15s;
        white-space: nowrap;
        width: fit-content;
        ${alignSelf};
      }
      #wt-toggle:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(232,96,10,.4); }
      #wt-toggle svg { width:18px;height:18px;fill:#fff;flex-shrink:0; }
      #wt-toggle-dot {
        width:8px;height:8px;border-radius:50%;background:#4ade80;
        animation:wt-live 2s ease-in-out infinite;flex-shrink:0;
      }
      @keyframes wt-live { 0%,100%{opacity:1} 50%{opacity:.3} }

      #wt-panel {
        background:#fff;
        border-radius:16px;
        box-shadow:0 8px 32px rgba(0,0,0,.14);
        overflow:hidden;
        margin-top:10px;
        transform-origin:${POSITION.includes('right')?'right':'left'} ${POSITION.includes('bottom')?'bottom':'top'};
        transition:opacity .2s,transform .2s;
      }
      #wt-panel.wt-hidden { opacity:0;transform:scale(.92);pointer-events:none; }

      .wt-ph {
        background:linear-gradient(135deg,#e8600a,#f5930a);
        padding:14px 16px 12px;color:#fff;
      }
      .wt-ph-label { font-size:11px;opacity:.8;letter-spacing:.07em;margin-bottom:2px; }
      .wt-ph-name  { font-size:15px;font-weight:700;line-height:1.2; }

      .wt-main {
        display:flex;align-items:flex-end;gap:4px;
        padding:16px 18px 8px;
      }
      .wt-num {
        font-size:58px;font-weight:800;line-height:1;
        color:#e8600a;letter-spacing:-.03em;
        font-variant-numeric:tabular-nums;transition:color .4s;
      }
      .wt-unit { font-size:17px;font-weight:600;color:#333;padding-bottom:8px; }
      .wt-badge {
        margin-left:auto;align-self:center;
        padding:4px 11px;border-radius:999px;
        font-size:11px;font-weight:700;letter-spacing:.04em;flex-shrink:0;
      }
      .wt-green  { background:#e6f7ef;color:#1fa363; }
      .wt-yellow { background:#fff8e1;color:#b07d00; }
      .wt-red    { background:#fdecea;color:#c0392b; }

      .wt-grid {
        display:grid;grid-template-columns:1fr 1fr;
        gap:1px;background:#f0f0f0;border-top:1px solid #f0f0f0;
      }
      .wt-cell { background:#fff;padding:9px 14px; }
      .wt-cell-label { font-size:10px;color:#aaa;margin-bottom:2px; }
      .wt-cell-value { font-size:14px;font-weight:700;color:#222; }

      .wt-notice {
        padding:6px 14px 10px;font-size:11px;color:#888;
        background:#fff;border-top:1px solid #f5f5f5;line-height:1.5;
      }
      .wt-foot {
        padding:8px 14px;font-size:10px;color:#bbb;
        background:#fafafa;border-top:1px solid #f0f0f0;
        display:flex;align-items:center;gap:5px;
      }
      .wt-foot-dot {
        width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;
        animation:wt-live 2s ease-in-out infinite;
      }
      .wt-loading,.wt-error {
        padding:28px 16px;text-align:center;font-size:13px;color:#aaa;
      }
      .wt-spinner {
        display:inline-block;width:20px;height:20px;
        border:3px solid #ffd9b3;border-top-color:#e8600a;
        border-radius:50%;animation:wt-spin .8s linear infinite;margin-bottom:8px;
      }
      @keyframes wt-spin { to { transform:rotate(360deg); } }
    `;
    const style = document.createElement('style');
    style.id = 'wt-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── 4. DOM 構築 ──────────────────────────────────────────────
  function buildDOM() {
    if (document.getElementById('wt-root')) return;

    const root = document.createElement('div');
    root.id = 'wt-root';

    const btn = document.createElement('button');
    btn.id = 'wt-toggle';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-1a1 1 0 0 1 .9-.99H12V8a1 1 0 0 1 2 0v8.93z"/></svg>
      <span id="wt-toggle-label">現在の待ち時間</span>
      <span id="wt-toggle-dot"></span>`;

    const panel = document.createElement('div');
    panel.id = 'wt-panel';
    panel.classList.add('wt-hidden');
    panel.innerHTML = `<div class="wt-loading"><div class="wt-spinner"></div><br>読み込み中…</div>`;

    btn.addEventListener('click', () => panel.classList.toggle('wt-hidden'));

    root.appendChild(btn);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  // ── 5. レンダリング ──────────────────────────────────────────
  function statusInfo(min) {
    if (min === null || min === undefined) return { label: '情報なし', cls: 'wt-yellow' };
    if (min === 0)  return { label: '待ちなし', cls: 'wt-green' };
    if (min <= 15)  return { label: '空き少々', cls: 'wt-green' };
    if (min <= 30)  return { label: 'やや混雑', cls: 'wt-yellow' };
    return          { label: '混雑中',   cls: 'wt-red' };
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }

  function renderPanel(data) {
    const panel = document.getElementById('wt-panel');
    if (!panel) return;

    const w      = data.wait_minutes;
    const st     = statusInfo(w);
    const numStr = (w === null || w === undefined) ? '—' : String(w);

    panel.innerHTML = `
      <div class="wt-ph">
        <div class="wt-ph-label">現在の待ち時間</div>
        <div class="wt-ph-name">${data.store_name ?? '店舗'}</div>
      </div>
      <div class="wt-main">
        <span class="wt-num">${numStr}</span>
        ${w != null ? '<span class="wt-unit">分</span>' : ''}
        <span class="wt-badge ${st.cls}">${st.label}</span>
      </div>
      <div class="wt-grid">
        <div class="wt-cell">
          <div class="wt-cell-label">待ち組数</div>
          <div class="wt-cell-value">${data.waiting_groups ?? '—'} 組</div>
        </div>
        <div class="wt-cell">
          <div class="wt-cell-label">最終更新</div>
          <div class="wt-cell-value">${fmtTime(data.updated_at)}</div>
        </div>
      </div>
      ${data.notice ? `<div class="wt-notice">📢 ${data.notice}</div>` : ''}
      <div class="wt-foot">
        <span class="wt-foot-dot"></span>5秒ごとに自動更新
      </div>`;

    // フローティングボタンのラベルも更新
    const lbl = document.getElementById('wt-toggle-label');
    if (lbl) lbl.textContent = w != null ? `待ち時間 ${w} 分` : '待ち時間';
  }

  function renderError(msg) {
    const panel = document.getElementById('wt-panel');
    if (panel) panel.innerHTML = `<div class="wt-error">⚠ ${msg}</div>`;
  }

  // ── 6. Supabase 接続 ─────────────────────────────────────────
  async function initSupabase() {
    const { createClient } = supabase;
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 最新データを取得
    // wait_times は store_id ごとに1行（UPSERT運用）なので .single() で確実に最新を取る
    async function fetchAndRender() {
      const { data, error } = await db
        .from('wait_times')
        .select('store_name, wait_minutes, waiting_groups, notice, updated_at')
        .eq('store_id', STORE_ID)
        .single(); // 1行確定なので limit/order 不要 → 常に現在の値を返す

      if (error) {
        console.warn('[wait-time-widget] fetch error:', error.message);
        return;
      }
      renderPanel(data);
    }

    // 初回取得
    const { data: first, error: firstErr } = await db
      .from('wait_times')
      .select('store_name, wait_minutes, waiting_groups, notice, updated_at')
      .eq('store_id', STORE_ID)
      .single();

    if (firstErr) {
      renderError('データを取得できませんでした');
      console.error('[wait-time-widget]', firstErr.message);
      return;
    }
    renderPanel(first);

    // 5秒ごとのポーリング（確実に最新を反映）
    setInterval(fetchAndRender, INTERVAL_MS);

    // Realtime 購読（DBが更新されたら即時反映）
    db.channel(`wt_store_${STORE_ID}`)
      .on('postgres_changes', {
        event: 'UPDATE', // wait_times は UPDATE のみ（UPSERT運用）
        schema: 'public',
        table: 'wait_times',
        filter: `store_id=eq.${STORE_ID}`,
      }, payload => {
        renderPanel(payload.new);
      })
      .subscribe();
  }

  // ── 7. 起動 ──────────────────────────────────────────────────
  async function boot() {
    injectStyles();
    buildDOM();
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      await initSupabase();
    } catch (e) {
      renderError('初期化に失敗しました');
      console.error('[wait-time-widget]', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
