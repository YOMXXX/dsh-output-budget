/**
 * dsh-output-budget — browser half.
 *
 * Two registrations share one module store: a compact chip in the composer tool
 * row (session-scoped, reads the `outputBudget` projection) and the modal it
 * opens in `shell.overlay` (root-scoped, so it is not clipped by the docked
 * composer). No RPC, no polling: the projection publishes on every commit.
 */
window.__ModuleLoader__.load({
  id: 'dsh-output-budget',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'output-budget'
    /** Projection key registered by the Host half. */
    const KEY = 'outputBudget'
    /** Data colors for the stacked bar; not theme tokens. */
    const PALETTE = {
      'git-status': '#6366f1',
      'git-log': '#8b5cf6',
      'git-diff': '#a855f7',
      search: '#06b6d4',
      listing: '#0ea5e9',
      package: '#f59e0b',
      test: '#ef4444',
      bash: '#64748b',
    }
    const SHAPE_LABEL = {
      'git-status': 'git status',
      'git-log': 'git log',
      'git-diff': 'git diff',
      search: 'search',
      listing: 'listing',
      package: 'package',
      test: 'test',
      bash: 'shell',
    }
    const EMPTY_DATA = { rewritten: 0, savedBytes: 0, previewBytes: 0, byShape: {}, items: [] }

    const DICT = {
      en: {
        chip: 'Output budget',
        chipEmpty: 'Output budget — nothing condensed yet',
        title: 'Output budget',
        subtitle: 'Noisy tool output is condensed before it reaches the model. The full text stays one read away and failures are never truncated.',
        saved: 'Saved',
        rewrites: 'Rewrites',
        ratio: 'Compression',
        recent: 'Recent digests',
        byShape: 'Where it came from',
        empty: 'Nothing has been condensed in this session yet.',
        emptyHint: 'Run a verbose command — git status, git log, a long listing — and it shows up here.',
        hint: 'Recover the full text with read on the locator in the notice. Switch modes with /budget dry-run, off or apply.',
        close: 'Close',
        ofOriginal: 'of the original',
        times: 'this session',
        now: 'just now',
        runs: 'shown',
      },
      zh: {
        chip: '输出预算',
        chipEmpty: '输出预算 — 本会话还没有摘要',
        title: '输出预算',
        subtitle: '噪音大的工具输出在进入模型前被压缩；完整原文一条 read 就能取回，失败输出永不裁剪。',
        saved: '已省',
        rewrites: '重写次数',
        ratio: '压缩率',
        recent: '最近的摘要',
        byShape: '来源分布',
        empty: '本会话还没有被摘要的工具输出。',
        emptyHint: '跑一条啰嗦的命令——git status、git log、长目录列表——这里就会出现记录。',
        hint: '取回原文：read 提示里的 locator。切换模式用 /budget dry-run、off 或 apply。',
        close: '关闭',
        ofOriginal: '占原文',
        times: '本会话',
        now: '刚刚',
        runs: '条',
      },
    }

    const CSS = `
.dob-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px 0 7px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}
.dob-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dob-chip[data-open="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}
.dob-chip[data-empty="true"]{opacity:.72}
.dob-chip svg{display:block;flex:none;opacity:.9}
.dob-chip-value{font-variant-numeric:tabular-nums;font-weight:600;color:var(--dsw-alias-label-primary)}
.dob-chip-unit{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dob-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1);pointer-events:auto}
.dob-card{width:min(760px,calc(100vw - 40px));max-height:min(80vh,780px);overflow:auto;border-radius:16px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 28px 72px rgba(0,0,0,.42);padding:20px 22px 16px}
.dob-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.dob-title{margin:0;font-size:15px;font-weight:650;letter-spacing:.01em}
.dob-sub{margin:5px 0 0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);max-width:58ch}
.dob-close{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;height:28px;padding:0 10px;font:inherit;font-size:12px;cursor:pointer}
.dob-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dob-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:4px}
.dob-kpi{position:relative;padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dob-kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--dob-accent,var(--dsw-alias-brand-primary));opacity:.9}
.dob-kpi-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.dob-kpi-value{margin-top:6px;font-size:23px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums}
.dob-kpi-note{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dob-section{margin-top:16px}
.dob-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:9px}
.dob-section-title{font-size:12px;font-weight:600;letter-spacing:.02em}
.dob-section-note{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dob-bar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.dob-bar-seg{height:100%}
.dob-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px}
.dob-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dob-dot{width:8px;height:8px;border-radius:3px;flex:none}
.dob-row{display:grid;grid-template-columns:86px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 2px;border-top:1px dashed var(--dsw-alias-border-l1)}
.dob-row:first-child{border-top:0}
.dob-pill{justify-self:start;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dob-cmd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dob-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dob-meta b{color:var(--dsw-alias-state-success-primary);font-weight:600}
.dob-empty{padding:26px 8px 20px;text-align:center}
.dob-empty-title{font-size:13px}
.dob-empty-hint{margin-top:6px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
.dob-foot{margin-top:18px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}
.dob-spark{display:flex;align-items:flex-end;gap:2px;height:26px;margin-top:10px}
.dob-spark span{flex:1;min-height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary);opacity:.5}
.dob-spark span:last-child{opacity:.95}
`

    /** Shared state between the chip and the root-scoped modal. */
    const store = {
      open: false,
      data: EMPTY_DATA,
      translate: (key) => DICT.en[key] ?? key,
      listeners: new Set(),
    }
    function emit() {
      for (const listener of [...store.listeners]) listener()
    }
    function subscribe(listener) {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }
    function setOpen(next) {
      if (store.open === next) return
      store.open = next
      emit()
    }
    /** Cheap structural signature; the selector keeps renders churn-free. */
    function keyOf(data) {
      return [data?.rewritten, data?.savedBytes, data?.previewBytes, (data?.items ?? []).length, data?.lastShape].join('|')
    }
    function setData(next) {
      if (keyOf(next) === keyOf(store.data)) return
      store.data = next
      emit()
    }
    function useExternal(select) {
      const get = () => select(store)
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, get, get)
      }
      const [value, setValue] = React.useState(get)
      React.useEffect(() => {
        const listener = () => setValue(get)
        store.listeners.add(listener)
        return () => store.listeners.delete(listener)
      }, [])
      return value
    }
    const useOpen = () => useExternal((state) => state.open)
    const useData = () => useExternal((state) => state.data)

    const identity = (state) => state

    function bytesOf(value) {
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      if (value < 1024) return `${Math.round(value)} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`
      return `${(value / (1024 * 1024)).toFixed(1)} MB`
    }
    function tokensOf(bytes) {
      const tokens = Math.round(bytes / 4)
      if (tokens < 1000) return String(tokens)
      if (tokens < 1000000) return `${(tokens / 1000).toFixed(tokens < 10000 ? 1 : 0)}k`
      return `${(tokens / 1000000).toFixed(1)}M`
    }
    function percentOf(part, whole) {
      if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0
      return Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
    }
    function colorOf(shape) {
      return PALETTE[shape] ?? PALETTE.bash
    }
    function labelOf(shape) {
      return SHAPE_LABEL[shape] ?? shape
    }
    function shapeRows(data) {
      const byShape = data?.byShape ?? {}
      return Object.keys(byShape)
        .map((shape) => ({ shape, count: byShape[shape].count ?? 0, savedBytes: byShape[shape].savedBytes ?? 0 }))
        .filter((row) => row.count > 0)
        .sort((left, right) => right.savedBytes - left.savedBytes)
    }

    function Glyph(props) {
      const size = props.size ?? 14
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: 'M2.5 4h11M4.5 8h7M6.5 12h3' }))
    }

    function Kpi(props) {
      return h('div', {
        className: 'dob-kpi',
        style: props.accent === undefined ? undefined : { '--dob-accent': props.accent },
      },
        h('div', { className: 'dob-kpi-label' }, props.label),
        h('div', { className: 'dob-kpi-value' }, props.value),
        h('div', { className: 'dob-kpi-note' }, props.note),
      )
    }

    function StackedBar(props) {
      const rows = props.rows
      const total = rows.reduce((sum, row) => sum + row.savedBytes, 0)
      if (total <= 0) return null
      return h('div', { className: 'dob-bar' },
        rows.map((row) => h('span', {
          key: row.shape,
          className: 'dob-bar-seg',
          style: { width: `${Math.max(2, (row.savedBytes / total) * 100)}%`, background: colorOf(row.shape) },
          title: `${labelOf(row.shape)} · ${bytesOf(row.savedBytes)}`,
        })))
    }

    function Legend(props) {
      return h('div', { className: 'dob-legend' },
        props.rows.map((row) => h('span', { key: row.shape, className: 'dob-legend-item' },
          h('span', { className: 'dob-dot', style: { background: colorOf(row.shape) } }),
          `${labelOf(row.shape)} ${row.count}`,
        )))
    }

    function Spark(props) {
      const values = props.values
      if (values.length < 2) return null
      const max = Math.max(...values, 1)
      return h('div', { className: 'dob-spark', 'aria-hidden': true },
        values.map((value, index) => h('span', {
          key: index,
          style: { height: `${Math.max(6, Math.round((value / max) * 100))}%` },
        })))
    }

    function Recent(props) {
      const items = [...(props.items ?? [])].slice(-8).reverse()
      if (items.length === 0) return null
      return h('div', null,
        items.map((item) => {
          const original = item.omittedBytes + item.previewBytes
          return h('div', { key: `${item.seq}`, className: 'dob-row' },
            h('span', { className: 'dob-pill', title: labelOf(item.shape) }, labelOf(item.shape)),
            h('span', { className: 'dob-cmd', title: item.command }, item.command === '' ? '—' : item.command),
            h('span', { className: 'dob-meta' },
              h('b', null, `−${percentOf(item.omittedBytes, original)}%`),
              ` · ${bytesOf(item.omittedBytes)} → ${bytesOf(item.previewBytes)}`,
            ))
        }))
    }

    function ChipView(props) {
      const t = props.translate
      const data = props.data
      const open = props.open
      const saved = data?.savedBytes ?? 0
      const empty = (data?.rewritten ?? 0) === 0
      const title = empty ? t('chipEmpty') : `${t('saved')} ${bytesOf(saved)} · ≈${tokensOf(saved)} tokens`
      return h('button', {
        type: 'button',
        className: 'dob-chip',
        title,
        'aria-label': title,
        'aria-expanded': String(open),
        'data-open': String(open),
        'data-empty': String(empty),
        onClick: () => setOpen(!store.open),
      },
        h(Glyph, { size: 14 }),
        empty
          ? h('span', null, t('chip'))
          : h(React.Fragment, null,
            h('span', { className: 'dob-chip-value' }, tokensOf(saved)),
            h('span', { className: 'dob-chip-unit' }, 'tok'),
          ))
    }

    function ChipReader(props) {
      const open = useOpen()
      const projected = props.useProjection(KEY, identity)
      const data = projected ?? EMPTY_DATA
      React.useEffect(() => {
        setData(data)
      }, [projected])
      return h(ChipView, { data, open, translate: store.translate })
    }

    function BudgetChip(props) {
      if (typeof props.useProjection !== 'function') {
        const open = useOpen()
        const data = useData()
        return h(ChipView, { data, open, translate: store.translate })
      }
      return h(ChipReader, props)
    }

    function PanelView(props) {
      const t = props.translate
      const data = props.data
      const rows = shapeRows(data)
      const saved = data?.savedBytes ?? 0
      const preview = data?.previewBytes ?? 0
      const rewritten = data?.rewritten ?? 0
      const original = saved + preview
      const ratio = percentOf(saved, original)
      const items = data?.items ?? []
      const lastShape = data?.lastShape

      return h('div', {
        className: 'dob-overlay',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) setOpen(false)
        },
      },
        h('div', { className: 'dob-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
          h('div', { className: 'dob-head' },
            h('div', null,
              h('h2', { className: 'dob-title' }, t('title')),
              h('p', { className: 'dob-sub' }, t('subtitle')),
            ),
            h('button', { type: 'button', className: 'dob-close', onClick: () => setOpen(false) }, t('close')),
          ),

          h('div', { className: 'dob-kpis' },
            h(Kpi, { label: t('saved'), value: bytesOf(saved), note: `≈${tokensOf(saved)} tokens` }),
            h(Kpi, {
              label: t('rewrites'), value: String(rewritten), note: t('times'),
              accent: 'var(--dsw-alias-state-business-primary)',
            }),
            h(Kpi, {
              label: t('ratio'), value: `${ratio}%`, note: `${t('ofOriginal')} · ${bytesOf(original)}`,
              accent: 'var(--dsw-alias-state-success-primary)',
            }),
          ),

          rewritten === 0
            ? h('div', { className: 'dob-empty' },
              h('div', { className: 'dob-empty-title' }, t('empty')),
              h('div', { className: 'dob-empty-hint' }, t('emptyHint')),
            )
            : h(React.Fragment, null,
              h('div', { className: 'dob-section' },
                h('div', { className: 'dob-section-head' },
                  h('span', { className: 'dob-section-title' }, t('byShape')),
                  h('span', { className: 'dob-section-note' },
                    lastShape === undefined ? '' : `${labelOf(lastShape)} · ${t('now')}`),
                ),
                h(StackedBar, { rows }),
                h(Legend, { rows }),
                h(Spark, { values: items.map((item) => item.omittedBytes) }),
              ),
              h('div', { className: 'dob-section' },
                h('div', { className: 'dob-section-head' },
                  h('span', { className: 'dob-section-title' }, t('recent')),
                  h('span', { className: 'dob-section-note' }, `${items.length} ${t('runs')}`),
                ),
                h(Recent, { items }),
              ),
            ),

          h('div', { className: 'dob-foot' }, t('hint')),
        ),
      )
    }

    function BudgetPanel() {
      const open = useOpen()
      const data = useData()
      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [open])
      if (!open) return null
      return h(PanelView, { data, translate: store.translate })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'output-budget: locale')
        const rebind = () => {
          try {
            store.translate = ctx.locale.bind(NS)
          } catch {
            // Fall back to the English dictionary when bind is unavailable.
          }
          emit()
        }
        rebind()
        ctx.effect(() => ctx.locale.subscribe(rebind), 'output-budget: locale changes')

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.setAttribute('data-plugin-css', JSON.stringify(NS))
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'output-budget: styles')

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'output-budget',
          order: 30,
          locale: NS,
        }, BudgetChip))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'output-budget-panel',
          order: 50,
          locale: NS,
        }, BudgetPanel))
      },
    }
  },
})
