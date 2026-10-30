import { useEffect } from 'react';
import { nameOf } from '../../core/vfs/paths';
import { assetUrl } from '../../shell/icons';
import { useHostState, type AppProps } from '../types';

export default function ImageView({ host }: AppProps) {
  useHostState(host);
  const info = host.args.path ? host.files!.stat(host.args.path) : null;
  const url = info?.assetId ? assetUrl(info.assetId) : null;
  useEffect(() => {
    host.setTitle?.(`${info ? nameOf(info.path) : 'Untitled'} - Image Viewer`);
  }, [host, info]);
  return (
    <div className="w95-sunken-panel" style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#808080' }} tabIndex={0} data-autofocus="">
      {url ? <img src={url} alt={info?.name ?? ''} style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }} /> : <p style={{ color: '#fff' }}>The picture could not be found.</p>}
    </div>
  );
}
