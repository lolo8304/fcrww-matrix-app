import {useLayoutEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './Icon';

export function ImageViewer({url, description, source, onClose}: {url: string; description: string; source: HTMLImageElement; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{x: number; y: number} | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const origin = useRef<DOMRect | null>(null);
  const scroll = useRef<{element: Element; top: number} | null>(null);
  const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
  function sourceTransform() {
    const rect = image.current?.getBoundingClientRect();
    const from = origin.current;
    if (!rect || !from || !rect.width || !rect.height) return 'none';
    return `translate(${from.left - rect.left}px, ${from.top - rect.top}px) scale(${from.width / rect.width}, ${from.height / rect.height})`;
  }
  useLayoutEffect(() => {
    const modal = dialog.current!;
    const fullImage = image.current!;
    const viewport = source.closest('.messages');
    origin.current = source.getBoundingClientRect();
    scroll.current = viewport ? {element: viewport, top: viewport.scrollTop} : null;
    const visibility = source.style.visibility;
    closing.current = false;
    modal.showModal();
    function enter() {
      if (closing.current) return;
      source.style.setProperty('visibility', 'hidden');
      animation.current = fullImage.animate([
        {transform: sourceTransform(), borderRadius: '10px'},
        {transform: 'none', borderRadius: '0px'},
      ], {duration: duration(), easing: 'cubic-bezier(.2,.75,.25,1)'});
      modal.animate([{backgroundColor: 'transparent'}, {backgroundColor: '#080c12f5'}], {duration: duration()});
    }
    if (fullImage.complete && fullImage.naturalWidth) enter();
    else fullImage.addEventListener('load', enter, {once: true});
    return () => {
      fullImage.removeEventListener('load', enter);
      animation.current?.cancel();
      source.style.setProperty('visibility', visibility);
    };
  }, [source]);
  function close() {
    if (closing.current) return;
    closing.current = true;
    const modal = dialog.current;
    const fullImage = image.current;
    if (!modal || !fullImage) return;
    const currentTransform = getComputedStyle(fullImage).transform;
    const currentRadius = getComputedStyle(fullImage).borderRadius;
    animation.current?.cancel();
    if (scroll.current) scroll.current.element.scrollTop = scroll.current.top;
    const exit = fullImage.animate([
      {transform: currentTransform, borderRadius: currentRadius},
      {transform: sourceTransform(), borderRadius: '10px'},
    ], {duration: duration(), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards'});
    animation.current = exit;
    modal.animate([{backgroundColor: '#080c12f5'}, {backgroundColor: 'transparent'}], {duration: duration(), fill: 'forwards'});
    void exit.finished.then(() => {
      modal.close();
      source.closest('button')?.focus({preventScroll: true});
      if (scroll.current) scroll.current.element.scrollTop = scroll.current.top;
    }).catch(() => { /* Unmount cancels an unfinished transition. */ });
  }
  return createPortal(<dialog ref={dialog} className="image-viewer" aria-label="Bildansicht" onClose={onClose} onCancel={e => { e.preventDefault(); close(); }}
    onTouchStart={e => {
      touchStart.current = e.touches.length === 1 ? {x: e.touches[0].clientX, y: e.touches[0].clientY} : null;
    }}
    onTouchMove={e => { if (e.touches.length !== 1) touchStart.current = null; }}
    onTouchCancel={() => { touchStart.current = null; }}
    onTouchEnd={e => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || e.touches.length || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      if (Math.abs(dy) >= 60 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        close();
      }
    }}
    onClick={e => {
    e.stopPropagation();
    if (e.target === e.currentTarget) close();
  }}>
    <button type="button" autoFocus className="image-viewer-back" aria-label="Zurück zu den Nachrichten" onClick={close}><Icon name="back" size={28} /></button>
    <img ref={image} src={url} alt={description} draggable={false} />
  </dialog>, document.body);
}
