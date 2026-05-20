import * as HiIcons from 'react-icons/hi2';

export default function CanvasIconGlyph({ name, color = '#1e293b', size = '100%' }) {
  const Icon = HiIcons[name] || HiIcons.HiQuestionMarkCircle;
  return <Icon style={{ width: size, height: size, color }} aria-hidden />;
}
