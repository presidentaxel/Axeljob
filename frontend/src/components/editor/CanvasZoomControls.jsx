import { HiMinus, HiPlus, HiArrowsPointingIn } from 'react-icons/hi2';
import '../../styles/CanvasZoomControls.css';

export default function CanvasZoomControls({
  percent = 100,
  canZoomOut = true,
  canZoomIn = true,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}) {
  return (
    <div className="canvas-zoom-controls" role="toolbar" aria-label="Zoom du canevas">
      <button
        type="button"
        className="canvas-zoom-controls__btn"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        title="Zoom arrière"
        aria-label="Zoom arrière"
      >
        <HiMinus aria-hidden />
      </button>
      <button
        type="button"
        className="canvas-zoom-controls__percent"
        onClick={onZoomReset}
        title="Réinitialiser le zoom (ajuster à la largeur)"
        aria-label={`Zoom ${percent} pour cent, réinitialiser`}
      >
        {percent}
        %
      </button>
      <button
        type="button"
        className="canvas-zoom-controls__btn"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        title="Zoom avant"
        aria-label="Zoom avant"
      >
        <HiPlus aria-hidden />
      </button>
      <button
        type="button"
        className="canvas-zoom-controls__btn canvas-zoom-controls__btn--fit"
        onClick={onZoomReset}
        title="Ajuster à la largeur"
        aria-label="Ajuster à la largeur"
      >
        <HiArrowsPointingIn aria-hidden />
      </button>
    </div>
  );
}
