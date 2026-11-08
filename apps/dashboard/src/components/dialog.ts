import { useCallback, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react'

// Marks the dialog as closing (CSS plays the exit animation from [data-closing]) and resolves once it has finished.
// With reduced motion the animation is near-instant, so this resolves straight away.
export async function animateOut(el: HTMLDialogElement) {
  el.dataset.closing = ''
  // Only the dialog's own and its backdrop's animations: children may loop forever (loading skeletons).
  const own = el.getAnimations({ subtree: true }).filter((a) => (a.effect as KeyframeEffect | null)?.target === el)
  const timeout = new Promise((done) => setTimeout(done, 400))
  await Promise.race([Promise.all(own.map((a) => a.finished.catch(() => {}))), timeout])
}

// A click on the backdrop lands on the <dialog> itself, outside its box. The press must also start there,
// so selecting text inside and releasing outside does not close it.
const outside = (e: MouseEvent<HTMLDialogElement>) => {
  if (e.target !== e.currentTarget) return false
  const b = e.currentTarget.getBoundingClientRect()
  return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom
}
export function backdropProps() {
  let pressed = false
  return {
    onPointerDown: (e: PointerEvent<HTMLDialogElement>) => { pressed = outside(e) },
    // Sent as a cancel, like Esc, so a dialog's own onCancel (for example "not while saving") still decides.
    onClick: (e: MouseEvent<HTMLDialogElement>) => { if (pressed && outside(e)) e.currentTarget.dispatchEvent(new Event('cancel', { cancelable: true })); pressed = false },
  }
}

// For dialogs the parent removes on close. Every way out (buttons, Esc, backdrop) should call close(), which animates first.
// close(then) runs `then` instead of onClose, for actions like "Done" that also close the dialog.
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const latest = useRef(onClose)
  latest.current = onClose
  const close = useCallback((then?: () => void) => {
    const el = ref.current
    if (!el?.open || closing.current) return
    closing.current = true
    void animateOut(el).then(() => {
      el.close()
      delete el.dataset.closing
      ;(then ?? latest.current)()
    })
  }, [])
  const backdrop = useRef(backdropProps()).current
  const props = {
    ref,
    ...backdrop,
    onCancel: (e: SyntheticEvent<HTMLDialogElement>) => { e.preventDefault(); close() },
    // Browsers may close on a repeated Esc despite preventDefault; the parent must still hear about it.
    onClose: () => { if (!closing.current) latest.current() },
  }
  return { ref, close, props }
}
