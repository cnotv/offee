import type { ViewLayout, WindowView } from './types.ts'

/** The settings page's compact bar above Offee, in pixels. */
export const toolbarHeight = 52

/**
 * Where the two views sit in the one window. They never overlap: the settings bar is drawn
 * above the Offee page, never inside it.
 * @param size The window's content size.
 * @param shown The view chosen.
 * @param hasOffee Whether the Offee view exists.
 * @returns The settings view's bounds, and the Offee view's, or null when it is hidden.
 */
export const layoutViews = (size: { width: number; height: number }, shown: WindowView, hasOffee: boolean): ViewLayout => {
  if (shown === 'settings' || !hasOffee) return { settings: { x: 0, y: 0, width: size.width, height: size.height }, offee: null }
  const bar = Math.min(toolbarHeight, size.height)
  return {
    settings: { x: 0, y: 0, width: size.width, height: bar },
    offee: { x: 0, y: bar, width: size.width, height: size.height - bar },
  }
}
