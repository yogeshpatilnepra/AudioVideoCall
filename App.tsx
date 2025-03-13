import React from 'react';

import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import CallScreen from './screens/CallScreen';
import SplashScreen from './screens/SplashScreen';
import ChatScreen from './screens/ChatScreen';
import { AppState } from 'react-native';
// const Stack = createStackNavigator();
export type RootStackParamList = {
  Splash: undefined;
  CallScreen: undefined;
  Chat: { myId: string; targetId: string };
};

const Stack = createStackNavigator<RootStackParamList>();
export default function App() {
  
  return (
    <NavigationContainer >
      <Stack.Navigator initialRouteName="Splash">
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="CallScreen"
          component={CallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      </Stack.Navigator>

    </NavigationContainer>
  );
}