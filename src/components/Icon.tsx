interface Props {
  name: 'chat' | 'search' | 'send' | 'back' | 'arrow' | 'shield' | 'lock' | 'more' | 'trash' | 'chevron' | 'timer' | 'plus' | 'camera' | 'file' | 'photo' | 'poll' | 'edit' | 'muted' | 'backup' | 'logout';
  size?: number;
}

export function Icon({ name, size = 22 }: Props) {
  if (name === 'timer') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18M12 3h4v4M12 12l4-4" /><path d="M16.5 4.2a9 9 0 0 1 0 15.6" strokeDasharray="1 4" /><circle cx="12" cy="12" r="1" /></svg>;
  const paths = {
    backup: 'M6 19a5 5 0 0 1-.8-9.94 7 7 0 0 1 13.55-1.2A5.5 5.5 0 0 1 18.5 19H6Zm5.5-6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 0H18m-2 0v2',
    muted: 'M3 3l18 18M10 3a6 6 0 0 1 8 6v4m-1 4H4l2-3V9c0-.8.2-1.6.5-2.3M10 21h4',
    edit: 'm16 3 5 5L8 21H3v-5L16 3Zm-2 2 5 5',
    plus: 'M12 3v18M3 12h18',
    camera: 'M3 6h4l2-3h6l2 3h4v15H3V6Zm14 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    file: 'M4 3h10l6 6v12H4V3Zm10 0v6h6',
    photo: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M8 7h.01',
    poll: 'M4 5h16M4 12h11M4 19h6',
    chevron: 'm6 9 6 6 6-6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm6 5v2',
    logout: 'M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-12 4 4-4 4M9 12h10',
    chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a8.5 8.5 0 0 1 8.5-8.5h3A8.5 8.5 0 0 1 21 11.5ZM7 9h8M7 13h5',
    search: 'm21 21-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    send: 'm3 3 19 9-19 9 4-9-4-9Zm4 9h15',
    back: 'm15 18-6-6 6-6',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  };
  return <svg width={size} height={size} viewBox={name === 'backup' ? '-1 -1 27 26' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function ClubMark() {
  return <img className="club-mark" src="/logo.png" alt="FC Rotweiss Winikon" width={57} height={57} />;
}

export function Avatar({ name, retentionLabel }: { name: string; retentionLabel?: string }) {
  const initials = name.trim().split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  return <span className="avatar" aria-hidden={retentionLabel ? undefined : true}>
    <span aria-hidden="true">{initials || '#'}</span>
    {retentionLabel && <span className="retention-badge" role="img" aria-label={retentionLabel} title={retentionLabel}><Icon name="timer" size={17} /></span>}
  </span>;
}
