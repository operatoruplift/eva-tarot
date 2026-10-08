import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './SoftSelect.css';

type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  description?: string;
};

type SoftSelectProps<T extends string | number> = {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  'aria-label': string;
  id?: string;
  className?: string;
  placement?: 'auto' | 'up' | 'down';
  disabled?: boolean;
};

/** Select-only combobox: focus stays on the trigger while its listbox is open. */
export function SoftSelect<T extends string | number>({ value, options, onChange, 'aria-label': label, id, className = '', placement = 'auto', disabled = false }: SoftSelectProps<T>) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ value: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [position, setPosition] = useState<CSSProperties>({});
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex];

  const openAt = (index = Math.max(0, selectedIndex)) => {
    if (disabled || !options.length) return;
    setActiveIndex(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    searchRef.current = { value: '', time: 0 };
    triggerRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const positionList = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const viewport = window.visualViewport;
      let top = (viewport?.offsetTop ?? 0) + 8;
      let bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 8;
      let left = (viewport?.offsetLeft ?? 0) + 8;
      let right = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 8;
      // Keeping the popup in the component tree preserves native dialog focus
      // handling. Respect every scroll boundary so the menu never gets clipped.
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + 8);
          bottom = Math.min(bottom, bounds.bottom - 8);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + 8);
          right = Math.min(right, bounds.right - 8);
        }
      }
      const above = rect.top - top - 8;
      const below = bottom - rect.bottom - 8;
      const preferredHeight = Math.min(304, options.length * 56 + 12);
      const shouldOpenUp = placement === 'up' ? above >= 88 || above > below : placement === 'down' ? below < 88 && above > below : below < preferredHeight && above > below;
      const available = Math.max(44, shouldOpenUp ? above : below);
      const width = Math.max(0, Math.min(Math.max(rect.width, 248), right - left));
      const popupLeft = Math.min(Math.max(rect.left, left), right - width);
      setDirection(shouldOpenUp ? 'up' : 'down');
      setPosition({ width, maxHeight: Math.min(304, available), left: popupLeft - rect.left });
    };
    const repositionOnScroll = (event: Event) => {
      // Scrolling the options must not pull the active item back into view.
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      positionList();
    };
    positionList();
    window.addEventListener('resize', positionList);
    window.addEventListener('scroll', repositionOnScroll, true);
    window.visualViewport?.addEventListener('resize', positionList);
    return () => {
      window.removeEventListener('resize', positionList);
      window.removeEventListener('scroll', repositionOnScroll, true);
      window.visualViewport?.removeEventListener('resize', positionList);
    };
  }, [open, options.length, placement]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [open, activeIndex, position]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !options.length) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation(); // Close this list without closing its parent dialog.
      setOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      if (open) choose(activeIndex);
      return; // Preserve normal forward/backward focus movement.
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(activeIndex); else openAt();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openAt();
      else setActiveIndex(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      openAt(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const query = `${now - searchRef.current.time < 700 ? searchRef.current.value : ''}${event.key.toLocaleLowerCase()}`;
      searchRef.current = { value: query, time: now };
      const needle = [...query].every(letter => letter === query[0]) ? query[0] : query;
      const start = needle.length === 1 ? (open ? activeIndex : selectedIndex) + 1 : 0;
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset + options.length) % options.length;
        if (options[index].label.toLocaleLowerCase().startsWith(needle)) { openAt(index); break; }
      }
    }
  };

  return <div ref={rootRef} className={`soft-select ${open ? 'is-open' : ''} ${className}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={triggerRef} id={id} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined} disabled={disabled} className="soft-select-trigger" onClick={() => { if (open) setOpen(false); else openAt(); }} onKeyDown={onKeyDown}>
      <span className="soft-select-value">{selected?.label ?? label}</span><ChevronDown className="soft-select-chevron" size={16} aria-hidden="true"/>
    </button>
    {open && <div ref={listRef} id={listId} role="listbox" aria-label={label} className={`soft-select-menu opens-${direction}`} style={position} onPointerDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value} className={`soft-select-option ${index === activeIndex ? 'is-active' : ''}`} onPointerMove={event => { if (event.pointerType === 'mouse') setActiveIndex(index); }} onClick={() => choose(index)}>
        <span className="soft-select-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span><span className="soft-select-check" aria-hidden="true">{option.value === value && <Check size={15}/>}</span>
      </div>)}
    </div>}
  </div>;
}
