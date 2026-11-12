// One icon that follows the customer's "icon style" setting: plain as it always was, or a coloured GlassIcon tile.
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import GlassIcon from "./GlassIcon";
import { useIconGlass } from "../useIconGlass";

interface Props {
  icon: LucideIcon;
  /** Tile colour in glass mode. */
  color: string;
  /** Tile side in px in glass mode. */
  size: number;
  /** The plain icon, exactly as it was before the glass style: its size, stroke and class. */
  plain: { size: number; strokeWidth?: number; className?: string };
  /** Extra classes for the tile (glass mode only). */
  className?: string;
  style?: CSSProperties;
}

export default function StyledIcon({ icon: Icon, color, size, plain, className, style }: Props) {
  const { glass, fill } = useIconGlass();
  if (!glass) return <Icon size={plain.size} strokeWidth={plain.strokeWidth} className={plain.className} aria-hidden />;
  return <GlassIcon icon={Icon} size={size} color={color} fill={fill} className={className} style={style} />;
}
