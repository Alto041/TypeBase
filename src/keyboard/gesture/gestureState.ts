export const gestureSwipeActiveRef = {current: false};

/** Tracks an active finger on the letter-key area for swipe vs tap. */
export const swipeTypingSessionRef = {
  touchActive: false,
  isSwiping: false,
  blockKeyPress: false,
  /** Set when a letter was inserted on press-in and should be undone if a swipe starts. */
  tapCommitted: false,
};

export function shouldBlockSwipeTypingKeyInput(): boolean {
  return (
    swipeTypingSessionRef.blockKeyPress ||
    swipeTypingSessionRef.isSwiping ||
    gestureSwipeActiveRef.current
  );
}

/** True when a completed swipe should not also register as a letter tap. */
export function shouldDeferSwipeTypingLetterTap(): boolean {
  return (
    swipeTypingSessionRef.blockKeyPress ||
    swipeTypingSessionRef.isSwiping ||
    gestureSwipeActiveRef.current
  );
}
