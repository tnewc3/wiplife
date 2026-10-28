import { content } from '../../content';

/**
 * A content icon (U1): a Microsoft Fluent Emoji from public/icons, named by an id in registries/icons.yaml. Decorative
 * unless given a label; an unknown id draws nothing, so a content mistake can't break a screen.
 */
export function Icon({ id, size = 24, label, className = '' }: { id: string; size?: number; label?: string; className?: string }) {
  if (!content.registries.icons.icons[id]) return null;
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/${id}.svg`}
      width={size}
      height={size}
      alt={label ?? ''}
      {...(label ? {} : { 'aria-hidden': true })}
      draggable={false}
      className={`inline-block shrink-0 ${className}`}
    />
  );
}
