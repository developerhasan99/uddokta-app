// Style presets: one choice sets a store's colours, font and corners. Plain data, so the API can validate a choice
// and the dashboard can draw swatches without importing the page components.

export type Preset = { label: readonly [bn: string, en: string]; font: string; vars: Record<string, string> }

export const presets = {
  fresh: { label: ['সবুজ', 'Fresh'], font: 'Hind Siliguri', vars: { accent: '#1f7a4d', ink: '#1d1d1f', paper: '#ffffff', tint: '#f5f6f4', rule: '#e3e5e1', radius: '10px' } },
  bold: { label: ['সাহসী', 'Bold'], font: 'Hind Siliguri', vars: { accent: '#c62828', ink: '#1a1a1a', paper: '#ffffff', tint: '#fbf3f2', rule: '#eee2e0', radius: '6px' } },
  calm: { label: ['শান্ত', 'Calm'], font: 'Noto Sans Bengali', vars: { accent: '#1f5f99', ink: '#17202a', paper: '#ffffff', tint: '#f1f5f9', rule: '#e1e7ee', radius: '12px' } },
  luxe: { label: ['অভিজাত', 'Luxe'], font: 'Tiro Bangla', vars: { accent: '#7a5c1f', ink: '#1c1a17', paper: '#fffdf8', tint: '#f6f1e6', rule: '#e9e1cf', radius: '2px' } },
  soft: { label: ['কোমল', 'Soft'], font: 'Baloo Da 2', vars: { accent: '#b0417a', ink: '#2a1f26', paper: '#ffffff', tint: '#fbf1f6', rule: '#f0dce6', radius: '18px' } },
  night: { label: ['রাত', 'Night'], font: 'Hind Siliguri', vars: { accent: '#e0a526', ink: '#f2f2f2', paper: '#141414', tint: '#1f1f1f', rule: '#2e2e2e', radius: '10px' } },
} satisfies Record<string, Preset>

export type PresetId = keyof typeof presets
export const presetIds = Object.keys(presets) as PresetId[]
export const isPreset = (v: unknown): v is PresetId => typeof v === 'string' && v in presets

const fontParam: Record<string, string> = {
  'Hind Siliguri': 'Hind+Siliguri:wght@400;600;700',
  'Noto Sans Bengali': 'Noto+Sans+Bengali:wght@400;600;700',
  'Tiro Bangla': 'Tiro+Bangla',
  'Baloo Da 2': 'Baloo+Da+2:wght@400;600;700',
}

export const presetFontsHref = (id: PresetId) => `https://fonts.googleapis.com/css2?family=${fontParam[presets[id].font]}&display=swap`

// Overrides the storefront's defaults; on a dark preset the accent's text turns dark so buttons stay readable.
export function presetCss(id: PresetId) {
  const p: Preset = presets[id]
  const v = p.vars
  const dark = v.paper !== '#ffffff' && v.paper !== '#fffdf8'
  return `:root{--sf-accent:${v.accent};--sf-ink:${v.ink};--sf-paper:${v.paper};--sf-tint:${v.tint};--sf-rule:${v.rule};--sf-radius:${v.radius};--sf-muted:${dark ? '#a8a8a8' : '#5f6368'};--sf-accent-ink:${dark ? '#141414' : '#ffffff'}}body{font-family:"${p.font}","Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif}`
}
