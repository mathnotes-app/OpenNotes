import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContinuousEnginePoolToolState } from '@mathnotes/mobile-ink';
import { DEFAULT_TOOL, TOOL_BY_TYPE, TOOL_DESCRIPTORS } from '../utils/toolPalette';
import type { SupportedTool } from '../utils/toolPalette';

const KEY = '@opennotes:toolStateV2';
const LEGACY_KEY = '@simple' + 'notes:toolStateV2';

export type ToolState = ContinuousEnginePoolToolState;

function defaultPerTool(): Record<SupportedTool, ToolState> {
  const out = {} as Record<SupportedTool, ToolState>;
  for (const descriptor of TOOL_DESCRIPTORS) {
    out[descriptor.type] = {
      toolType: descriptor.type,
      width: descriptor.defaultWidth,
      color: descriptor.defaultColor,
      eraserMode: descriptor.type === 'eraser' ? 'pixel' : 'pixel',
    };
  }
  return out;
}

export function useToolState() {
  const [perTool, setPerTool] = useState<Record<SupportedTool, ToolState>>(defaultPerTool);
  const [activeType, setActiveType] = useState<SupportedTool>(DEFAULT_TOOL);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) {
          return AsyncStorage.getItem(LEGACY_KEY).then((legacyRaw) => {
            if (legacyRaw) AsyncStorage.setItem(KEY, legacyRaw).catch(() => undefined);
            return legacyRaw;
          });
        }
        return raw;
      })
      .then((raw) => {
        if (!mounted || !raw) {
          hydratedRef.current = true;
          return;
        }
        try {
          const parsed = JSON.parse(raw) as {
            activeType?: SupportedTool;
            perTool?: Partial<Record<SupportedTool, ToolState>>;
          };
          if (parsed.perTool) {
            setPerTool((prev) => {
              const merged = { ...prev };
              for (const key of Object.keys(parsed.perTool ?? {}) as SupportedTool[]) {
                const value = parsed.perTool?.[key];
                if (value) merged[key] = { ...merged[key], ...value, toolType: key };
              }
              return merged;
            });
          }
          if (parsed.activeType && TOOL_BY_TYPE[parsed.activeType]) {
            setActiveType(parsed.activeType);
          }
        } catch {
          // ignore
        }
        hydratedRef.current = true;
      })
      .catch(() => {
        hydratedRef.current = true;
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(
    (nextPerTool: Record<SupportedTool, ToolState>, nextActive: SupportedTool) => {
      if (!hydratedRef.current) return;
      const payload = JSON.stringify({
        activeType: nextActive,
        perTool: nextPerTool,
      });
      AsyncStorage.setItem(KEY, payload).catch(() => undefined);
    },
    [],
  );

  const toolState = perTool[activeType];

  const setToolState = useCallback(
    (updater: ToolState | ((prev: ToolState) => ToolState)) => {
      setPerTool((prev) => {
        const current = prev[activeType];
        const next =
          typeof updater === 'function' ? (updater as (p: ToolState) => ToolState)(current) : updater;
        const merged = { ...prev, [activeType]: { ...next, toolType: activeType } };
        persist(merged, activeType);
        return merged;
      });
    },
    [activeType, persist],
  );

  const selectTool = useCallback(
    (type: SupportedTool) => {
      setActiveType((prev) => {
        if (prev === type) return prev;
        persist(perTool, type);
        return type;
      });
    },
    [perTool, persist],
  );

  const toolColors = useMemo(() => {
    const out = {} as Record<SupportedTool, string>;
    for (const descriptor of TOOL_DESCRIPTORS) {
      out[descriptor.type] = perTool[descriptor.type]?.color ?? descriptor.defaultColor;
    }
    return out;
  }, [perTool]);

  return { toolState, setToolState, selectTool, toolColors, perTool };
}
