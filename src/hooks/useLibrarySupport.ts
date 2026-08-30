import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { OPEN_NOTES_LINKS, openExternalLink } from '../services/externalLinks';
import { t } from '../i18n';
import {
  claimCommunityPrompt,
  requestAutomaticReviewIfEligible,
  requestManualReview,
  resolveCommunityPrompt,
} from '../services/lifecycleService';

interface LibrarySupportOptions {
  canShowAutomaticPrompt: boolean;
  onClose: () => void;
  onShowCommunity: () => void;
}

export function useLibrarySupport({
  canShowAutomaticPrompt,
  onClose,
  onShowCommunity,
}: LibrarySupportOptions) {
  const actionInFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!canShowAutomaticPrompt) {
        return () => {
          active = false;
        };
      }

      void (async () => {
        try {
          if (await claimCommunityPrompt()) {
            if (active) onShowCommunity();
            return;
          }
          await requestAutomaticReviewIfEligible();
        } catch (error) {
          if (__DEV__) console.warn('[useLibrarySupport] prompt failed', error);
        }
      })();

      return () => {
        active = false;
      };
    }, [canShowAutomaticPrompt, onShowCommunity]),
  );

  const dismissCommunity = useCallback(async () => {
    onClose();
    try {
      await resolveCommunityPrompt('dismissed');
    } catch (error) {
      if (__DEV__) console.warn('[useLibrarySupport] dismissal failed', error);
    }
  }, [onClose]);

  const joinCommunity = useCallback(async () => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const opened = await openExternalLink(
        OPEN_NOTES_LINKS.community,
        'useLibrarySupport',
      );
      if (!opened) return;
      await resolveCommunityPrompt('joined');
      onClose();
    } catch (error) {
      if (__DEV__) console.warn('[useLibrarySupport] join failed', error);
      Alert.alert(t.community.couldNotUpdateTitle, t.common.pleaseTryAgain);
    } finally {
      actionInFlightRef.current = false;
    }
  }, [onClose]);

  const rateOpenNotes = useCallback(async () => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const requested = await requestManualReview();
      if (!requested) {
        Alert.alert(
          t.community.ratingsUnavailableTitle,
          t.community.ratingsUnavailableMessage,
        );
      }
    } catch (error) {
      if (__DEV__) console.warn('[useLibrarySupport] review failed', error);
      Alert.alert(t.community.couldNotOpenRatingsTitle, t.common.pleaseTryAgainLater);
    } finally {
      actionInFlightRef.current = false;
    }
  }, []);

  return { dismissCommunity, joinCommunity, rateOpenNotes };
}
