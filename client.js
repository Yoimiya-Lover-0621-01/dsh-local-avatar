/**
 * Local account avatar — browser half.
 *
 * Two seats, no Host state:
 *  - `settings.general.item` adds one preference row under General; the user
 *    picks a local image and the browser crops it to 256x256 and keeps it in
 *    this client's local storage.
 *  - `shell.overlay` owns one stylesheet that paints that image over the
 *    shipped DeepSeek account picture. The account launcher and Account
 *    settings both render the picture inside an element carrying
 *    `data-avatar-status` (the wrapper classes are a fallback for the
 *    signed-in/loading states that omit the attribute), so the override never
 *    touches account state, profile data, or Platform requests.
 *
 * Clearing the image unmounts the stylesheet and the shipped picture returns.
 */
window.__ModuleLoader__.load({
  id: '@local/local-avatar',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const STORAGE_KEY = 'dsh-local-avatar:v1'
    const CHANGE_EVENT = 'dsh-local-avatar-change'
    const NS = 'local-avatar'
    const MAX_STORED_CHARS = 700000

    /** Simplified Chinese copy (key-set source of truth). */
    const zh = {
      'title': '账户头像',
      'description': '用本地图片替换 DeepSeek 账户头像，只在本机生效。',
      'state.local': '正在使用本地图片',
      'state.account': '正在使用 DeepSeek 账户头像',
      'choose': '选择图片',
      'reset': '恢复默认',
      'busy': '正在处理…',
      'hint': '支持 PNG、JPG、WebP、GIF；选好后自动裁剪为 256×256，仅保存在这台电脑上。',
      'error.invalid': '无法读取这张图片，请换一张试试。',
      'error.storage': '图片已经应用，但保存到本地失败；重启应用后可能丢失。',
    }

    /** English copy. */
    const en = {
      'title': 'Account avatar',
      'description': 'Replace the DeepSeek account picture with a local image. Applies to this computer only.',
      'state.local': 'Using a local picture',
      'state.account': 'Using the DeepSeek account picture',
      'choose': 'Choose image',
      'reset': 'Restore default',
      'busy': 'Processing…',
      'hint': 'PNG, JPG, WebP, or GIF; cropped to 256×256 and stored on this computer only.',
      'error.invalid': 'That image could not be read. Try another one.',
      'error.storage': 'The picture is applied but could not be saved locally; it may be lost after a restart.',
    }

    // --------------------------------------------------------------------
    // Local storage bridge: both slot occupants subscribe to one value.
    // --------------------------------------------------------------------

    let cached
    let loaded = false

    function isPictureUrl(value) {
      return typeof value === 'string' && value.startsWith('data:image/')
    }

    function readAvatar() {
      if (!loaded) {
        loaded = true
        try {
          const stored = window.localStorage.getItem(STORAGE_KEY)
          cached = isPictureUrl(stored) ? stored : null
        } catch (_error) {
          cached = null
        }
      }
      return cached
    }

    function reloadAvatar() {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        cached = isPictureUrl(stored) ? stored : null
      } catch (_error) {
        cached = null
      }
      return cached
    }

    function publish() {
      try {
        window.dispatchEvent(new Event(CHANGE_EVENT))
      } catch (_error) {
        // A blocked CustomEvent dispatch cannot happen for a plain Event, but
        // keeping the store silent is safer than throwing into React.
      }
    }

    function commitAvatar(value) {
      let storageError = null
      try {
        if (value) window.localStorage.setItem(STORAGE_KEY, value)
        else window.localStorage.removeItem(STORAGE_KEY)
      } catch (_error) {
        storageError = new Error('storage')
      }
      cached = value || null
      loaded = true
      publish()
      if (storageError) throw storageError
    }

    function useAvatar() {
      const [avatar, setAvatar] = React.useState(() => readAvatar())
      React.useEffect(() => {
        const sync = () => setAvatar(reloadAvatar())
        const onStorage = (event) => {
          if (!event || event.key === null || event.key === STORAGE_KEY) sync()
        }
        window.addEventListener(CHANGE_EVENT, sync)
        window.addEventListener('storage', onStorage)
        return () => {
          window.removeEventListener(CHANGE_EVENT, sync)
          window.removeEventListener('storage', onStorage)
        }
      }, [])
      return avatar
    }

    // --------------------------------------------------------------------
    // Image preparation: square crop, small WebP (JPEG fallback), data URL.
    // --------------------------------------------------------------------

    function loadPicture(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
          URL.revokeObjectURL(url)
          resolve(image)
        }
        image.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('invalid'))
        }
        image.src = url
      })
    }

    async function prepareAvatar(file) {
      if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
        throw new Error('invalid')
      }
      const image = await loadPicture(file)
      const sourceWidth = image.naturalWidth || image.width
      const sourceHeight = image.naturalHeight || image.height
      if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error('invalid')

      // Try a generous WebP first, then degrade until the data URL is small
      // enough for local storage while staying sharp at 24–32px display size.
      for (const attempt of [{ size: 256, quality: 0.9 }, { size: 224, quality: 0.82 }, { size: 192, quality: 0.78 }]) {
        const canvas = document.createElement('canvas')
        canvas.width = attempt.size
        canvas.height = attempt.size
        const context = canvas.getContext('2d')
        if (!context) throw new Error('invalid')
        const scale = Math.max(attempt.size / sourceWidth, attempt.size / sourceHeight)
        const width = Math.max(1, Math.round(sourceWidth * scale))
        const height = Math.max(1, Math.round(sourceHeight * scale))
        context.drawImage(image, Math.round((attempt.size - width) / 2), Math.round((attempt.size - height) / 2), width, height)
        let dataUrl = ''
        try {
          dataUrl = canvas.toDataURL('image/webp', attempt.quality)
        } catch (_error) {
          dataUrl = ''
        }
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', attempt.quality)
        }
        if (!dataUrl.startsWith('data:image/')) throw new Error('invalid')
        if (dataUrl.length <= MAX_STORED_CHARS) return dataUrl
      }
      throw new Error('invalid')
    }

    // --------------------------------------------------------------------
    // General settings row.
    // --------------------------------------------------------------------

    const ROW_CSS = `
.dla_group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.dla_title {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.dla_desc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
}
.dla_controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
}
.dla_preview {
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--dsw-alias-label-tertiary);
  background-color: var(--dsw-alias-bg-skeleton, var(--dsw-alias-bg-layer-2));
  background-position: center center;
  background-size: cover;
  background-repeat: no-repeat;
  box-shadow: inset 0 0 0 .5px var(--dsw-alias-border-l2);
}
.dla_state {
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dla_button {
  box-sizing: border-box;
  height: 32px;
  padding: 0 12px;
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.dla_button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dla_button:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dla_button:disabled {
  opacity: .45;
  cursor: default;
}
.dla_primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.dla_primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #5d7bff);
}
.dla_hint {
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  font-size: 12px;
  line-height: 18px;
}
.dla_error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
.dla_file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
`

    function AvatarGlyph() {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      h('circle', { cx: 12, cy: 8.5, r: 3.5 }),
      h('path', { d: 'M4.5 19.5c.9-3.5 3.8-5.5 7.5-5.5s6.6 2 7.5 5.5' }))
    }

    function AvatarRow({ t }) {
      const avatar = useAvatar()
      const inputRef = React.useRef(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      const choose = () => {
        setError(null)
        const input = inputRef.current
        if (input) input.click()
      }

      const onFileChange = async (event) => {
        const target = event.target
        const file = target && target.files && target.files[0]
        if (target) target.value = ''
        if (!file) return
        setBusy(true)
        setError(null)
        try {
          const dataUrl = await prepareAvatar(file)
          commitAvatar(dataUrl)
        } catch (failure) {
          setError(failure && failure.message === 'storage' ? 'storage' : 'invalid')
        } finally {
          setBusy(false)
        }
      }

      const reset = () => {
        if (busy) return
        setError(null)
        try {
          commitAvatar(null)
        } catch (_failure) {
          setError('storage')
        }
      }

      return h('div', { className: 'dla_group' },
        h('style', { key: 'row-css' }, ROW_CSS),
        h('div', { className: 'dla_title' }, t('title')),
        h('div', { className: 'dla_desc' }, t('description')),
        h('div', { className: 'dla_controls' },
          h('span', {
            className: 'dla_preview',
            'aria-hidden': true,
            style: avatar ? { backgroundImage: `url("${avatar}")` } : undefined,
          }, avatar ? null : h(AvatarGlyph)),
          h('span', { className: 'dla_state' }, avatar ? t('state.local') : t('state.account')),
          h('button', {
            type: 'button',
            className: 'dla_button dla_primary',
            onClick: choose,
            disabled: busy,
          }, busy ? t('busy') : t('choose')),
          h('button', {
            type: 'button',
            className: 'dla_button',
            onClick: reset,
            disabled: busy || !avatar,
          }, t('reset')),
        ),
        h('div', { className: 'dla_hint' }, t('hint')),
        error ? h('div', { className: 'dla_error', role: 'alert' }, t(`error.${error}`)) : null,
        h('input', {
          ref: inputRef,
          type: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif',
          className: 'dla_file',
          tabIndex: -1,
          'aria-hidden': 'true',
          onChange: onFileChange,
        }),
      )
    }

    // --------------------------------------------------------------------
    // Global override stylesheet: shipped account picture -> local picture.
    // --------------------------------------------------------------------

    function AvatarStyle() {
      const avatar = useAvatar()
      if (!avatar) return null
      const css = `
:root { --dsh-local-avatar: url("${avatar}"); }
[data-avatar-status],
[class*="ET65mq_avatar"],
[class*="_8RVnMG_avatar"] {
  background-image: var(--dsh-local-avatar) !important;
  background-position: center center !important;
  background-size: cover !important;
  background-repeat: no-repeat !important;
}
[data-avatar-status] > *,
[class*="ET65mq_avatar"] > *,
[class*="_8RVnMG_avatar"] > * {
  visibility: hidden !important;
}
`
      return h('style', { 'data-dsh-plugin': 'local-avatar' }, css)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'local-avatar: dictionaries')

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'local-avatar',
          order: 5,
          locale: NS,
        }, AvatarRow))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'local-avatar-style',
          order: 90,
        }, AvatarStyle))
      },
    }
  },
})
