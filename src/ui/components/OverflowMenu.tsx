import { ActionSheet, type SheetAction } from './ActionSheet';

/**
 * The ⋯ menu of a feature screen's header (U3): a sheet of the secondary and destructive actions (rename, leave, go solo,
 * quit, switch, retire, sell). Anything that can't be undone asks first (the action opens a ConfirmSheet).
 */
export function OverflowMenu({ open, title, actions, onClose }: { open: boolean; title: string; actions: readonly SheetAction[]; onClose: () => void }) {
  return <ActionSheet open={open} title={title} actions={actions} onClose={onClose} />;
}
