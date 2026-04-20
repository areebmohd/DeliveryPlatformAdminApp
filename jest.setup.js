// Jest setup file
jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
    onMessage: jest.fn(() => jest.fn()),
    onTokenRefresh: jest.fn(() => jest.fn()),
    registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
  }),
  messaging: jest.fn(() => ({
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
    onMessage: jest.fn(() => jest.fn()),
    onTokenRefresh: jest.fn(() => jest.fn()),
    registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(() => Promise.resolve()),
    requestPermission: jest.fn(() => Promise.resolve()),
    displayNotification: jest.fn(() => Promise.resolve()),
    onBackgroundEvent: jest.fn(),
    onForegroundEvent: jest.fn(),
  },
  AndroidImportance: { HIGH: 4 },
  AndroidVisibility: { PUBLIC: 0 },
  EventType: { PRESS: 1 },
}));

jest.mock('@supabase/supabase-js', () => ({
  __esModule: true,
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null } })),
    },
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    from: jest.fn(() => ({
      select: jest.fn(function() {
        this.order = jest.fn((field, options) => this);
        this.eq = jest.fn((field, value) => this);
        this.single = jest.fn(() => Promise.resolve({ data: null, error: null }));
        return Promise.resolve({ data: [], error: null });
      }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn(function() { return this; }),
      subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
    })),
    removeChannel: jest.fn(),
  })),
}));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  __esModule: true,
  NavigationContainer: ({ children }) => children,
  useNavigation: () => ({
    navigate: jest.fn(),
    dispatch: jest.fn(),
  }),
  createNavigationContainerRef: jest.fn(),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  __esModule: true,
  createBottomTabNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
  }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  __esModule: true,
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
  }),
}));

jest.mock('react-native-gesture-handler', () => ({
  __esModule: true,
  Swipeable: () => null,
  DrawerLayout: () => null,
  State: {},
  Directions: {},
}));

jest.mock('react-native-screens', () => ({
  __esModule: true,
  enableScreens: jest.fn(),
  Screen: () => null,
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'MockIcon');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MockIcon');

// Suppress console warnings during tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

