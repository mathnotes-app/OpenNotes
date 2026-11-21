import { Alert } from 'react-native';
import { t } from '../../i18n';
import { addNoteToDrive, driveSupported } from '../../services/iCloudDrive';
import type { NoteMetadata } from '../../types/note';
import type { MenuAction } from './ItemActionsMenu';

export function iCloudDriveActions(note: NoteMetadata): MenuAction[] {
  if (!driveSupported) return [];
  return [{
    key: 'icloud-drive',
    label: t.drive.add,
    onPress: () => Alert.alert(t.drive.addTitle, t.drive.addDetails, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.drive.add,
        onPress: () => {
          void addNoteToDrive(note.id).then(
            () => Alert.alert(t.drive.added, t.drive.savedDetails),
            (error: { code?: string }) => Alert.alert(
              t.drive.title,
              error.code === 'E_DRIVE_UNAVAILABLE' || error.code === 'E_DRIVE_ACCOUNT' ? t.drive.unavailable : t.drive.failed,
            ),
          );
        },
      },
    ]),
  }];
}
