# Note editor

OverlayLayer renders each image/text box once in document coordinates. An asset
keeps its original owner page even when dragged across a boundary; callbacks
convert positions back to that owner's local coordinates. Export projects the
same asset onto every page it overlaps.

Image and text dragging measure movement from the initial absolute touch point,
not the gesture recognizer's later activation point. Their shared zoom value is
updated from the viewport store without rerendering every overlay on each frame.
Cancelled drags restore the starting position. Resize/crop/rotation paths have
separate handlers and are covered by the native interaction audit.

The history directory serializes user overlay changes with native ink undo/redo.
The note screen maintains synchronous overlay refs for saves and waits for history
before persistence/export. Image picker storage owns durable resource files.

`overlayGeometry.ts` keeps asset resize coordinates relative to the owning page.
Negative top positions and heights spanning neighboring pages are valid; resize
must not clamp them into one page. Horizontal bounds and minimum sizes remain.
Image and text drags also preserve owner-relative coordinates across page breaks;
text resizing uses the same unbounded vertical-coordinate rule.

Asset pan gestures accept one finger; multi-touch is left to the viewport pinch.
Canceled resize/crop/rotation gestures restore their starting geometry instead of
committing a partial edit. Native zoom tests assert achieved visual scale, not
merely that XCTest issued a pinch.

Native cross-page verification uses the same drag/resize/undo/restart/export checks for images and text, including an explicit achieved zoom assertion. Text does not enlarge during gestures, preserving exact pointer-to-box geometry.

Rotated image resize and crop deltas are converted from absolute pointer motion into image-local axes using the current viewport scale. Frame anchoring preserves the opposite rotated edge. Crop limits keep normalized source rectangles and displayed dimensions consistent, including the minimum visible crop.

Native notebook load failures use the same recovery screen as unreadable body files. Both deferred and already-mounted loads catch rejection, disable autosave, and reset canvas readiness before retry. The invalid-native-payload fixture verifies retry/relaunch keeps the original body instead of replacing it with a blank notebook.

Run the native audit against an owned simulator with the release-built app
installed. Run `python3 scripts/seed-native-audit.py SIMULATOR_UUID` before
each suite to reset fixture geometry; the image/text tests persist their edits.
Use the `OpenNotesIntegrity` Xcode scheme for the UI cases, then run
`python3 scripts/verify-native-audit.py SIMULATOR_UUID` to verify the dense
notebook's stroke count and preservation of the invalid drawing bytes.
Undo/Redo stay disabled until native document loading succeeds, and remain
available during autosaves.
