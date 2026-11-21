# Overlay history

User image/text mutations produce field patches in the native ink history. The
transaction queue records each patch once, outside React state updaters, and
applies it only after native acceptance. Derived/native ink data is never restored
from an overlay snapshot. Undo/redo waits for the matching native acknowledgement;
saves and exports wait for the queue before reading overlays. Invalid history or
an uncertain native result blocks saving instead of persisting inconsistent state.

Images are copied into note-owned storage by imageInsertStorage before insertion.
The editor updates its overlay ref synchronously with accepted changes so exit
saves cannot observe a previous React render. The host adapter is useOverlayHistory;
patch and transactions are pure modules exercised by overlayHistory.test.mjs.
