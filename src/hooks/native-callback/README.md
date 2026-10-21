# Native callback lifetime

Callbacks handed to `runOnJS` may remain rooted by the animation runtime after an
editor unmounts. A render closure can indirectly own the entire notebook through
its parent callbacks. `useNativeCallback` returns a stable function created
outside that render scope. A layout effect replaces its current consumer and
clears it on unmount. Late animation events therefore cannot edit a closed note
or retain its contents. This does not suppress callback errors.

Image and text overlays use this boundary for select, move, resize, rotate, and crop events.
