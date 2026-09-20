import { useLayoutEffect, useRef, type RefObject } from 'react';

export function MessageInput({inputRef, value, readOnly, onChange, onResize, hasAttachment = false}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onResize: () => void;
  hasAttachment?: boolean;
}) {
  const resized = useRef(onResize);
  useLayoutEffect(() => { resized.current = onResize; }, [onResize]);
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    function resize() {
      const style = getComputedStyle(field!);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const maxHeight = 5 * parseFloat(style.lineHeight) + padding + borders;
      field!.style.maxHeight = `${maxHeight}px`;
      field!.style.height = 'auto';
      const height = field!.scrollHeight + borders;
      field!.style.height = `${Math.min(height, maxHeight)}px`;
      field!.style.overflowY = height > maxHeight ? 'auto' : 'hidden';
      resized.current();
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [inputRef, value, hasAttachment]);

  return <textarea ref={inputRef} aria-label="Nachricht" rows={1} value={value} readOnly={readOnly}
    onChange={event => onChange(event.target.value)} autoComplete="off"
    onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!readOnly && (value.trim() || hasAttachment)) event.currentTarget.form?.requestSubmit();
    }} />;
}
