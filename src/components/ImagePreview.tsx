import { useEffect, useMemo, useState, type FC } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import './ImagePreview.css';

interface ImagePreviewProps {
  filePath: string;
  fileName?: string;
}

const ImagePreview: FC<ImagePreviewProps> = ({ filePath, fileName }) => {
  const [error, setError] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  const src = useMemo(() => {
    try {
      return convertFileSrc(filePath);
    } catch (err) {
      return '';
    }
  }, [filePath]);

  useEffect(() => {
    setError(null);
    setNatural(null);
    setZoom(1);
  }, [filePath]);

  if (!src) {
    return (
      <div className="image-preview image-preview-error">
        <p>无法加载图片路径</p>
        <code>{filePath}</code>
      </div>
    );
  }

  return (
    <div className="image-preview">
      <div className="image-preview-toolbar">
        <span className="image-preview-name" title={filePath}>
          {fileName || filePath.replace(/\\/g, '/').split('/').pop()}
        </span>
        {natural && (
          <span className="image-preview-meta">
            {natural.w} × {natural.h}
          </span>
        )}
        <div className="image-preview-zoom">
          <button type="button" className="image-preview-btn" onClick={() => setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))}>
            −
          </button>
          <button type="button" className="image-preview-btn" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="image-preview-btn" onClick={() => setZoom((z) => Math.min(5, +(z + 0.1).toFixed(2)))}>
            +
          </button>
          <button type="button" className="image-preview-btn" onClick={() => setZoom(1)}>
            适应
          </button>
        </div>
      </div>

      <div className="image-preview-stage">
        {error ? (
          <div className="image-preview-error">
            <p>图片加载失败</p>
            <code>{error}</code>
          </div>
        ) : (
          <img
            src={src}
            alt={fileName || 'image'}
            style={{ transform: `scale(${zoom})` }}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            onError={() => setError(filePath)}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
};

export default ImagePreview;
