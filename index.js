import {Buffer} from 'buffer';
import {AppRegistry} from 'react-native';

global.Buffer = global.Buffer || Buffer;
import {registerRootComponent} from 'expo';

import App from './App';
import KeyboardApp from './src/keyboard/KeyboardApp';

registerRootComponent(App);
AppRegistry.registerComponent('TypeBaseKeyboard', () => KeyboardApp);
