// dsh-custom-wallpaper browser half: renders the wallpaper settings card in
// the plugin configuration section and paints the wallpaper onto the page.
//
// The bundle follows the client-plugin contract: it calls
// window.__ModuleLoader__.load({id, factory}) and the factory returns
// { apply, inject }. It talks to the host routes (/custom-wallpaper/config,
// /custom-wallpaper/image) instead of the settings seam, because
// dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES list is hard-coded and would
// answer "settings-not-exposed" for this third-party namespace.

window.__ModuleLoader__.load({
  id: 'dsh-custom-wallpaper',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const react_jsx_runtime = require('react/jsx-runtime')

    /** Config route prefix (same-origin with the web shell). */
    const CONFIG_URL = '/custom-wallpaper/config'

    /** Wallpaper defaults mirroring the host half. */
    const DEFAULT_CONFIG = { enabled: false, image: '', scrim: 0.35, blur: 0, size: 'cover' }

    /** Dictionary namespace owned by this plugin. */
    const NS = 'custom-wallpaper'

    // --- wallpaper painting -------------------------------------------------

    /**
     * Apply (or retract) the wallpaper from the current config. Writes ride
     * body dataset + CSS variables so the injected stylesheet reacts live.
     * @param config - resolved wallpaper configuration.
     */
    function paint(config) {
      const body = document.body
      if (config.enabled && config.image) {
        body.dataset.dshCustomWallpaper = ''
        const src = /^https?:\/\//i.test(config.image)
          ? config.image
          : `/custom-wallpaper/image?path=${encodeURIComponent(config.image)}`
        body.style.setProperty('--dsh-wallpaper-image', `url("${src}")`)
        body.style.setProperty('--dsh-wallpaper-size', config.size)
        body.style.setProperty('--dsh-wallpaper-scrim', String(config.scrim))
        body.style.setProperty('--dsh-wallpaper-blur', `${config.blur}px`)
      } else {
        delete body.dataset.dshCustomWallpaper
        body.style.removeProperty('--dsh-wallpaper-image')
        body.style.removeProperty('--dsh-wallpaper-size')
        body.style.removeProperty('--dsh-wallpaper-scrim')
        body.style.removeProperty('--dsh-wallpaper-blur')
      }
    }

    /**
     * Fetch the current wallpaper configuration.
     * @returns the resolved config (defaults merged host-side).
     */
    async function loadConfig() {
      try {
        const response = await fetch(CONFIG_URL)
        const payload = await response.json()
        if (payload.ok) return { ...DEFAULT_CONFIG, ...payload.value }
      } catch {
        // fall through to defaults
      }
      return { ...DEFAULT_CONFIG }
    }

    /**
     * Persist a wallpaper configuration and repaint.
     * @param value - config to store.
     * @returns true when the host accepted the write.
     */
    async function saveConfig(value) {
      try {
        const response = await fetch(CONFIG_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value }),
        })
        const payload = await response.json()
        if (payload.ok) {
          paint(payload.value)
          return true
        }
      } catch {
        // fall through
      }
      return false
    }

    // --- injected stylesheet -------------------------------------------------

    /**
     * Stylesheet painting the wallpaper as a fixed backdrop under the app
     * content. The ::before layer sits at z-index -1 (below #root, above the
     * body background) and is pointer-transparent, so it never intercepts
     * interaction; #root's background is cleared so the art shows through the
     * translucent panel surfaces, matching the skin convention.
     */
    const WALLPAPER_CSS = `
body[data-dsh-custom-wallpaper]::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: linear-gradient(rgba(6, 14, 36, var(--dsh-wallpaper-scrim, 0.35)) 0%, rgba(6, 14, 36, var(--dsh-wallpaper-scrim, 0.35)) 100%), var(--dsh-wallpaper-image);
  background-size: var(--dsh-wallpaper-size, cover), var(--dsh-wallpaper-size, cover);
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
  filter: blur(var(--dsh-wallpaper-blur, 0px));
}
body[data-dsh-custom-wallpaper] [id=root] {
  background: transparent;
}
`

    const STYLE_TAG_ID = 'dsh-custom-wallpaper/styles'
    function ensureStyleTag() {
      if (document.getElementById(STYLE_TAG_ID)) return
      const tag = document.createElement('style')
      tag.id = STYLE_TAG_ID
      tag.dataset.plugin = 'dsh-custom-wallpaper'
      tag.textContent = WALLPAPER_CSS
      document.head.appendChild(tag)
    }

    // --- settings card -------------------------------------------------------

    /** Locale dictionaries for the settings card. */
    const zh = {
      'card.title': '自定义壁纸',
      'card.description': '为 Web UI 设置自定义背景壁纸，支持本地图片与网络图片。',
      'field.enabled': '启用自定义壁纸',
      'field.enabledHint': '关闭后恢复默认背景。',
      'field.image': '壁纸图片',
      'field.imageHint': '支持 http(s):// 网络图片 URL，或本机图片的绝对路径（如 /Users/you/Pictures/wallpaper.jpg）。',
      'field.imagePlaceholder': 'https://… 或 /Users/…/wallpaper.jpg',
      'field.scrim': '遮罩强度',
      'field.scrimHint': '深色遮罩让前景文字更清晰。',
      'field.blur': '模糊',
      'field.blurHint': '对壁纸做高斯模糊（像素）。',
      'field.size': '铺放方式',
      'field.sizeCover': '铺满（裁切）',
      'field.sizeContain': '完整显示（留边）',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.discard': '重置',
      'settings.notExposed': '无法读取自定义壁纸配置。',
      'settings.saveFailed': '保存失败，请检查输入。',
      'settings.expand': '展开设置',
    }
    const en = {
      'card.title': 'Custom Wallpaper',
      'card.description': 'Set a custom background wallpaper for the Web UI (local file or network image).',
      'field.enabled': 'Enable custom wallpaper',
      'field.enabledHint': 'Restores the default background when off.',
      'field.image': 'Wallpaper image',
      'field.imageHint': 'An http(s):// image URL, or an absolute path on this machine (e.g. /Users/you/Pictures/wallpaper.jpg).',
      'field.imagePlaceholder': 'https://… or /Users/…/wallpaper.jpg',
      'field.scrim': 'Scrim',
      'field.scrimHint': 'Dark veil keeping foreground text readable.',
      'field.blur': 'Blur',
      'field.blurHint': 'Gaussian blur applied to the wallpaper (px).',
      'field.size': 'Fit',
      'field.sizeCover': 'Cover (crop)',
      'field.sizeContain': 'Contain (letterbox)',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.discard': 'Reset',
      'settings.notExposed': 'Cannot read the wallpaper configuration.',
      'settings.saveFailed': 'Save failed. Check your input.',
      'settings.expand': 'Show settings',
    }

    const cardStyle = {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-layer-3)',
      borderRadius: '12px',
      listStyle: 'none',
    }
    const headerStyle = {
      appearance: 'none',
      width: '100%',
      color: 'inherit',
      font: 'inherit',
      textAlign: 'left',
      cursor: 'pointer',
      background: '0 0',
      border: 0,
      borderRadius: '12px',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px',
      display: 'flex',
    }
    const headTextStyle = { flexDirection: 'column', flex: 1, gap: '4px', minWidth: 0, display: 'flex' }
    const nameStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '15px', fontWeight: 600, lineHeight: 1.4, margin: 0 }
    const descStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px', lineHeight: 1.5, margin: 0 }
    const bodyStyle = { borderTop: '1px solid var(--dsw-alias-border-l2)', margin: '0 16px', padding: '12px 0 8px', flexDirection: 'column', gap: '12px', display: 'flex' }
    const fieldStyle = { flexDirection: 'column', gap: '6px', display: 'flex' }
    const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: 500, lineHeight: 1.5, margin: 0 }
    const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: 1.5, margin: 0 }
    const inputStyle = {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-layer-3)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '13px',
      lineHeight: 1.5,
      width: '100%',
      boxSizing: 'border-box',
    }
    const rangeRowStyle = { alignItems: 'center', gap: '10px', display: 'flex' }
    const rangeStyle = { flex: 1, accentColor: 'var(--dsw-alias-brand-primary)' }
    const rangeValueStyle = { color: 'var(--dsw-alias-brand-primary)', fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: '36px', textAlign: 'right' }
    const footerStyle = { borderTop: '1px solid var(--dsw-alias-border-l2)', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', padding: '12px 0 4px', display: 'flex' }
    const buttonBase = {
      appearance: 'none',
      font: 'inherit',
      cursor: 'pointer',
      border: '1px solid transparent',
      borderRadius: '8px',
      padding: '5px 14px',
      fontSize: '13px',
      lineHeight: 1.5,
    }
    const saveButtonStyle = { ...buttonBase, background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-layer-3)' }
    const discardButtonStyle = { ...buttonBase, borderColor: 'var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-secondary)', background: '0 0' }
    const statusStyle = { color: 'var(--dsw-alias-state-success-primary)', fontSize: '12px', margin: '0 12px 0 0' }
    const errorStyle = { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', margin: '0 12px 0 0' }

    /**
     * The wallpaper settings card. Holds a draft in local state, persists on
     * Save, and repaints the page live.
     * @param props - { t } locale copy from the slot contract.
     */
    function WallpaperCard(props) {
      const { t } = props
      const [open, setOpen] = react.useState(false)
      const [draft, setDraft] = react.useState({ ...DEFAULT_CONFIG })
      const [loaded, setLoaded] = react.useState(false)
      const [saving, setSaving] = react.useState(false)
      const [status, setStatus] = react.useState('')
      const [error, setError] = react.useState('')

      react.useEffect(() => {
        let alive = true
        loadConfig().then((config) => {
          if (!alive) return
          setDraft(config)
          setLoaded(true)
        })
        return () => { alive = false }
      }, [])

      const applyDraft = (patch) => {
        setDraft((previous) => ({ ...previous, ...patch }))
        setError('')
        setStatus('')
      }

      const onSave = async () => {
        setSaving(true)
        setError('')
        setStatus('')
        const ok = await saveConfig({ ...draft })
        setSaving(false)
        if (ok) setStatus(t('settings.saved'))
        else setError(t('settings.saveFailed'))
      }

      const onDiscard = () => {
        setDraft({ ...DEFAULT_CONFIG })
        setError('')
        setStatus('')
      }

      const scrimPercent = Math.round((draft.scrim ?? 0.35) * 100)

      return react_jsx_runtime.jsxs('li', {
        style: cardStyle,
        children: [
          react_jsx_runtime.jsx('button', {
            type: 'button',
            style: headerStyle,
            'aria-label': `${t('settings.expand')}: ${t('card.title')}`,
            onClick: () => setOpen((value) => !value),
            children: react_jsx_runtime.jsxs('span', {
              style: headTextStyle,
              children: [
                react_jsx_runtime.jsx('span', { style: nameStyle, children: t('card.title') }),
                react_jsx_runtime.jsx('span', { style: descStyle, children: t('card.description') }),
              ],
            }),
          }),
          open
            ? react_jsx_runtime.jsxs('div', {
                style: bodyStyle,
                children: [
                  react_jsx_runtime.jsxs('div', {
                    style: fieldStyle,
                    children: [
                      react_jsx_runtime.jsxs('label', {
                        style: { ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px' },
                        children: [
                          react_jsx_runtime.jsx('input', {
                            type: 'checkbox',
                            checked: !!draft.enabled,
                            onChange: (event) => applyDraft({ enabled: event.target.checked }),
                          }),
                          t('field.enabled'),
                        ],
                      }),
                      react_jsx_runtime.jsx('p', { style: hintStyle, children: t('field.enabledHint') }),
                    ],
                  }),
                  react_jsx_runtime.jsxs('div', {
                    style: fieldStyle,
                    children: [
                      react_jsx_runtime.jsx('label', { style: labelStyle, children: t('field.image') }),
                      react_jsx_runtime.jsx('input', {
                        type: 'text',
                        style: inputStyle,
                        placeholder: t('field.imagePlaceholder'),
                        value: draft.image ?? '',
                        onChange: (event) => applyDraft({ image: event.target.value }),
                      }),
                      react_jsx_runtime.jsx('p', { style: hintStyle, children: t('field.imageHint') }),
                    ],
                  }),
                  react_jsx_runtime.jsxs('div', {
                    style: fieldStyle,
                    children: [
                      react_jsx_runtime.jsxs('div', {
                        style: rangeRowStyle,
                        children: [
                          react_jsx_runtime.jsx('label', { style: labelStyle, children: t('field.scrim') }),
                          react_jsx_runtime.jsx('input', {
                            type: 'range',
                            style: rangeStyle,
                            min: 0,
                            max: 100,
                            value: scrimPercent,
                            onChange: (event) => applyDraft({ scrim: Number(event.target.value) / 100 }),
                          }),
                          react_jsx_runtime.jsx('span', { style: rangeValueStyle, children: `${scrimPercent}%` }),
                        ],
                      }),
                      react_jsx_runtime.jsx('p', { style: hintStyle, children: t('field.scrimHint') }),
                    ],
                  }),
                  react_jsx_runtime.jsxs('div', {
                    style: fieldStyle,
                    children: [
                      react_jsx_runtime.jsxs('div', {
                        style: rangeRowStyle,
                        children: [
                          react_jsx_runtime.jsx('label', { style: labelStyle, children: t('field.blur') }),
                          react_jsx_runtime.jsx('input', {
                            type: 'range',
                            style: rangeStyle,
                            min: 0,
                            max: 40,
                            value: draft.blur ?? 0,
                            onChange: (event) => applyDraft({ blur: Number(event.target.value) }),
                          }),
                          react_jsx_runtime.jsx('span', { style: rangeValueStyle, children: `${draft.blur ?? 0}px` }),
                        ],
                      }),
                      react_jsx_runtime.jsx('p', { style: hintStyle, children: t('field.blurHint') }),
                    ],
                  }),
                  react_jsx_runtime.jsxs('div', {
                    style: fieldStyle,
                    children: [
                      react_jsx_runtime.jsx('label', { style: labelStyle, children: t('field.size') }),
                      react_jsx_runtime.jsx('select', {
                        style: inputStyle,
                        value: draft.size ?? 'cover',
                        onChange: (event) => applyDraft({ size: event.target.value }),
                        children: [
                          react_jsx_runtime.jsx('option', { value: 'cover', children: t('field.sizeCover') }),
                          react_jsx_runtime.jsx('option', { value: 'contain', children: t('field.sizeContain') }),
                        ],
                      }),
                    ],
                  }),
                  react_jsx_runtime.jsxs('div', {
                    style: footerStyle,
                    children: [
                      status ? react_jsx_runtime.jsx('p', { style: statusStyle, children: status }) : null,
                      error ? react_jsx_runtime.jsx('p', { style: errorStyle, children: error }) : null,
                      react_jsx_runtime.jsx('button', {
                        type: 'button',
                        style: discardButtonStyle,
                        disabled: saving,
                        onClick: onDiscard,
                        children: t('settings.discard'),
                      }),
                      react_jsx_runtime.jsx('button', {
                        type: 'button',
                        style: saveButtonStyle,
                        disabled: saving || !loaded,
                        onClick: onSave,
                        children: saving ? t('settings.saving') : t('settings.save'),
                      }),
                    ],
                  }),
                ],
              })
            : null,
        ],
      })
    }

    /** Services required by the browser half. */
    const inject = ['slots', 'locale']

    /**
     * Register the wallpaper surface: the settings card over the plugin
     * configuration section, and the live paint on page load.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ensureStyleTag()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'custom-wallpaper: dictionaries')
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'custom-wallpaper',
        order: 115,
        locale: NS,
        inject: () => ({}),
      }, WallpaperCard))
      ctx.effect(() => {
        let alive = true
        loadConfig().then((config) => {
          if (alive) paint(config)
        })
        return () => { alive = false }
      }, 'custom-wallpaper: initial paint')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
