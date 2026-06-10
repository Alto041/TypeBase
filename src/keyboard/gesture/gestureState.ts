export const gestureSwipeActiveRef = {current: false};

/** Tracks an active finger on the letter-key area for swipe vs tap. */
export const swipeTypingSessionRef = {
  touchActive: false,
  isSwiping: false,
  blockKeyPress: false,
};

export function shouldBlockSwipeTypingKeyInput(): boolean {
  return (
    swipeTypingSessionRef.blockKeyPress ||
    swipeTypingSessionRef.isSwiping ||
    gestureSwipeActiveRef.current
  );
}
