import React, { useMemo } from 'react';

type LayerConfig = {
  className: string;
  speed: string;
  size: string;
  zIndex: number;
  image: string;
  animation?: string;
  bottom?: string;
  noRepeat?: boolean;
  opacity?: number;
};

const layersData: LayerConfig[] = [
  { className: 'layer-6', speed: '120s', size: '222px', zIndex: 1, image: '6', opacity: 1 },
  { className: 'layer-5', speed: '95s', size: '311px', zIndex: 1, image: '5', opacity: 1 },
  { className: 'layer-4', speed: '75s', size: '468px', zIndex: 1, image: '4', opacity: 1 },
  {
    className: 'bike-1',
    speed: '10s',
    size: '75px',
    zIndex: 2,
    image: 'bike',
    animation: 'parallax_bike',
    bottom: '100px',
    noRepeat: true,
    opacity: 1,
  },
  {
    className: 'bike-2',
    speed: '15s',
    size: '75px',
    zIndex: 2,
    image: 'bike',
    animation: 'parallax_bike',
    bottom: '100px',
    noRepeat: true,
    opacity: 1,
  },
  { className: 'layer-3', speed: '55s', size: '158px', zIndex: 3, image: '3', opacity: 1 },
  { className: 'layer-2', speed: '30s', size: '145px', zIndex: 4, image: '2', opacity: 1 },
  { className: 'layer-1', speed: '20s', size: '136px', zIndex: 5, image: '1', opacity: 1 },
];

type MountainVistaParallaxProps = {
  title?: string;
  subtitle?: string;
};

function MountainVistaParallax({ title = '', subtitle = '' }: MountainVistaParallaxProps) {
  const dynamicStyles = useMemo(() => {
    return layersData
      .map((layer) => {
        const url = `https://s3-us-west-2.amazonaws.com/s.cdpn.io/24650/${layer.image}.png`;
        return `
          .${layer.className} {
            background-image: url(${url});
            animation-duration: ${layer.speed};
            background-size: auto ${layer.size};
            z-index: ${layer.zIndex};
            opacity: ${layer.opacity ?? 1};
            ${layer.animation ? `animation-name: ${layer.animation};` : ''}
            ${layer.bottom ? `bottom: ${layer.bottom};` : ''}
            ${layer.noRepeat ? 'background-repeat: no-repeat;' : ''}
          }
        `;
      })
      .join('\n');
  }, []);

  return (
    <section className="hero-container" aria-label="An animated parallax landscape of mountains and cyclists.">
      <style>{dynamicStyles}</style>
      {layersData.map((layer) => (
        <div key={layer.className} className={`parallax-layer ${layer.className}`} />
      ))}
      {(title || subtitle) && (
        <div className="hero-content">
          {title ? <h1 className="hero-title">{title}</h1> : null}
          {subtitle ? <p className="hero-subtitle">{subtitle}</p> : null}
        </div>
      )}
    </section>
  );
}

export default React.memo(MountainVistaParallax);
