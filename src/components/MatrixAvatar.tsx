import { useEffect, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { Avatar } from './Icon';

export function MatrixAvatar({client, name, mxc}: {client: MatrixClient; name: string; mxc?: string}) {
  const [image, setImage] = useState<{mxc: string; url: string}>();
  useEffect(() => {
    if (!mxc?.startsWith('mxc://')) return;
    const url = client.mxcUrlToHttp(mxc, 96, 96, 'crop', false, false, true);
    if (!url || new URL(url).origin !== new URL(client.getHomeserverUrl()).origin) return;
    const controller = new AbortController();
    let objectUrl = '';
    void fetch(url, {headers: {Authorization: `Bearer ${client.getAccessToken()}`}, signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer'}).then(response => {
      if (!response.ok) throw new Error('Avatar unavailable');
      return response.blob();
    }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setImage({mxc, url: objectUrl});
    }).catch(() => { /* Initials remain available if the avatar cannot load. */ });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, mxc]);
  return image?.mxc === mxc && image ? <img className="matrix-avatar" src={image.url} alt="" /> : <Avatar name={name} />;
}
