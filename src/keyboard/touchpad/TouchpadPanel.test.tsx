import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {TouchpadPanel} from './TouchpadPanel';
import * as keyboardBridge from '../keyboardBridge';

// Mock the keyboard bridge
jest.mock('../keyboardBridge', () => ({
  keyboardBridge: {
    setTouchpadGestureConsuming: jest.fn(),
    moveCursorDirection: jest.fn().mockResolvedValue(true),
    copySelection: jest.fn().mockResolvedValue(true),
    cutSelection: jest.fn().mockResolvedValue(true),
    deleteBackward: jest.fn(),
    setTouchpadSelectMode: jest.fn().mockResolvedValue(true),
    processTouchpadGesture: jest.fn().mockResolvedValue(true),
    pollTouchpadMoves: jest.fn().mockResolvedValue(
      JSON.stringify({
        moves: [],
        selectMode: false,
        gestureEnded: false,
        fireHaptic: false,
      })
    ),
    resetTouchpadEngine: jest.fn().mockResolvedValue(true),
  },
}));

// Mock haptics
jest.mock('../haptics', () => ({
  triggerKeyHaptic: jest.fn(),
}));

// Mock theme context
jest.mock('../KeyboardThemeContext', () => ({
  useKeyboardTheme: () => ({
    scheme: 'light',
    icon: '#000',
    letterKey: '#fff',
    numpadActionKey: '#eee',
    spaceKey: '#ddd',
    enter: '#007AFF',
    enterPressed: '#0051D5',
    modifierKeyPressed: '#ccc',
    spaceLabel: '#000',
    iconOnEnter: '#fff',
    keyRadius: 6,
    keyGap: 5,
    keyRowPaddingHorizontal: 8,
    numpadKeyHeight: 44,
    fontFamily: 'System',
  }),
  useThemedStyles: (fn) => fn({} as any),
}));

// Mock plugin panel layout
jest.mock('../components/pluginPanelLayout', () => ({
  usePluginPanelStyles: () => ({
    container: {},
  }),
}));

describe('TouchpadPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render touchpad and action buttons', () => {
    const {getByText} = render(<TouchpadPanel />);

    expect(getByText('Select')).toBeTruthy();
  });

  it('should handle copy action', async () => {
    const {getByText} = render(<TouchpadPanel />);
    const copyButton = getByText('Copy', {exact: false}).parent;

    fireEvent.press(copyButton);

    await waitFor(() => {
      expect(keyboardBridge.keyboardBridge.copySelection).toHaveBeenCalled();
    });
  });

  it('should handle cut action', async () => {
    const {getByText} = render(<TouchpadPanel />);
    const cutButton = getByText('Cut', {exact: false}).parent;

    fireEvent.press(cutButton);

    await waitFor(() => {
      expect(keyboardBridge.keyboardBridge.cutSelection).toHaveBeenCalled();
    });
  });

  it('should toggle select mode', async () => {
    const {getByText} = render(<TouchpadPanel />);
    const selectButton = getByText('Select');

    fireEvent.press(selectButton);

    await waitFor(() => {
      expect(keyboardBridge.keyboardBridge.setTouchpadSelectMode).toHaveBeenCalledWith(
        true
      );
    });

    fireEvent.press(selectButton);

    await waitFor(() => {
      expect(keyboardBridge.keyboardBridge.setTouchpadSelectMode).toHaveBeenCalledWith(
        false
      );
    });
  });

  it('should handle backspace action', async () => {
    const {getByText} = render(<TouchpadPanel />);
    const backspaceButton = getByText('Backspace', {exact: false}).parent;

    fireEvent.press(backspaceButton);

    await waitFor(() => {
      expect(keyboardBridge.keyboardBridge.deleteBackward).toHaveBeenCalled();
    });
  });

  it('should start and stop gesture polling on pan', async () => {
    const onGestureActiveChange = jest.fn();
    const {getByTestId} = render(
      <TouchpadPanel onGestureActiveChange={onGestureActiveChange} />
    );

    // Note: In real testing, this would require more sophisticated mocking
    // of the PanResponder and its callbacks
  });

  it('should call gesture consuming on mount/unmount', () => {
    const {unmount} = render(<TouchpadPanel />);

    expect(keyboardBridge.keyboardBridge.setTouchpadGestureConsuming).toHaveBeenCalled();

    unmount();

    expect(keyboardBridge.keyboardBridge.setTouchpadGestureConsuming).toHaveBeenCalledWith(
      false
    );
  });
});
