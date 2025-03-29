import React, { useEffect, useRef, useState } from 'react';

import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AppState, AppStateStatus, Modal, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Sound from 'react-native-sound';
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import AudioCallScreen from './components/AudioCallScreen';
import { GettingCallOverlay } from './components/GettingCallOverlay';
import Utils from './components/Utils';
import Video from './components/Video';
import CallScreen from './screens/CallScreen';
import ChatScreen from './screens/ChatScreen';
import LoginScreen from './screens/LoginScreen';
import SplashScreen from './screens/SplashScreen';
// const Stack = createStackNavigator();
export type RootStackParamList = {
  Splash: undefined;
  CallScreen: { myId: string };
  LoginScreen: undefined;
  Chat: { myId: string; targetId: string, joinCall?: boolean };
};
const configuration = {
  "iceServers": [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: "stun:stun.1.google.com:19302" },
  ]
};
const Stack = createStackNavigator<RootStackParamList>();

const ChatNotificationOverlay = ({ senderId, message, onDismiss }: { senderId: string; message: string; onDismiss: () => void }) => (
  <Modal transparent visible animationType="slide">
    <View style={styles.overlayContainer}>
      <View style={styles.chatNotification}>
        <Text style={styles.chatTitle}>New Message from {senderId}</Text>
        <Text style={styles.chatBody}>{message}</Text>
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.buttonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

export default function App() {

  const [myId, setMyId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callId: string; callType?: 'audio' | 'video'; accepted?: boolean } | null>(null);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection>(new RTCPeerConnection(configuration));
  const connecting = useRef(false);
  const [gettingCall, setGettingCall] = useState(false);

  const ringtoneRef = useRef<Sound | null>(null);
  const [uniqueId, setUniqueId] = useState('');

  //for the chat notification
  const [chatNotification, setChatNotification] = useState<{ senderId: string; message: string } | null>(null);
  const [myFcmToken, setMyFcmToken] = useState<string | null>(null);

  useEffect(() => {
    const setupFcm = async () => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      const authStatus = await messaging().requestPermission();
      if (authStatus === messaging.AuthorizationStatus.AUTHORIZED) {
        const token = await messaging().getToken();
        console.log('FCM Token:', token);
        if (myId) {
          await firestore().collection('users').doc(myId).set({ fcmToken: token }, { merge: true });
        }
      }

    };

    // Handle auth state
    const unsubscribeAuth = getAuth().onAuthStateChanged(user => {
      if (user && !myId) setMyId(user.uid);
    });

    setupFcm();
    return () => unsubscribeAuth();
  }, [myId]);

  // useEffect(() => {
  //   const fetchUniqueId = async () => {
  //     const id = await DeviceInfo.getUniqueId();
  //     setUniqueId(id);
  //   };

  //   fetchUniqueId();
  // }, []);

  console.log("uniqueId--->", uniqueId);

  //ringtone play on other phone while call-- code for play sound
  useEffect(() => {
    Sound.setCategory('Playback', true); // iOS category for playback
    const ringtone = new Sound('ringtone.mp3', Sound.MAIN_BUNDLE, (error) => {
      if (error) {
        console.error('Failed to load ringtone:', error);
        return;
      }
      ringtone.setVolume(1.0);
      ringtoneRef.current = ringtone;
    });

    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.stop(() => ringtoneRef.current!.release());
      }
    };
  }, []);

  useEffect(() => {
    const loadId = async () => {
      const savedId = await AsyncStorage.getItem('myId');
      if (savedId) setMyId(savedId);
    };
    loadId();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = getAuth().onAuthStateChanged(user => {
      if (user && !myId) setMyId(user.uid);
    });

    return () => unsubscribeAuth();
  }, [myId]);


  useEffect(() => {
    const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
      const { title, body, type } = remoteMessage.data || {};
      if (type === 'call' && !incomingCall) {
        // Call notification handled by Firestore listener, but ensure no overlap
        console.log('Call notification received:', title, body);
      } else if (type === 'chat') {
        setChatNotification({ senderId: remoteMessage.data!.senderId.toString(), message: body.toString() });
      }
    });

    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('Background notification:', remoteMessage);
    });

    messaging().getInitialNotification().then((remoteMessage) => {
      if (remoteMessage) {
        handleNotificationTap(remoteMessage);
      }
    });

    const unsubscribeTap = messaging().onNotificationOpenedApp((remoteMessage) => {
      handleNotificationTap(remoteMessage);
    });

    return () => {
      unsubscribeForeground();
      unsubscribeTap();
    };
  }, [incomingCall]);

  useEffect(() => {
    if (!myId) return;

    const chatSubscribe = firestore()
      .collection('notifications')
      .where('targetId', '==', myId)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.type === 'chat' && AppState.currentState === 'active') {
              setChatNotification({ senderId: data.senderId || 'Unknown', message: data.message || '' });
              // await displayNotification('New Message', `${data.senderId || 'Unknown'}: ${data.message || ''}`, 'chat', data.senderId || 'Unknown');
              await change.doc.ref.delete();
            }
          }
        });
      });

    return () => {
      chatSubscribe();
    };
  }, [myId]);

  const displayNotification = async (title: string, body: string, type: 'chat' | 'call', senderId: string) => {
    await notifee.displayNotification({
      title,
      body,
      data: { type, senderId },
      android: { channelId: 'default', sound: 'default', pressAction: { id: 'default' } },
      ios: { sound: 'default' },
    });
  };

  // Step 7: Handle FCM Background and Tap
  useEffect(() => {
    const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
      const { type, senderId, body } = remoteMessage.data || {};
      if (type === 'chat' && AppState.currentState === 'active') {
        setChatNotification({ senderId: senderId.toString() || 'Unknown', message: body.toString() || '' });
      }
    });

    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('Background notification:', remoteMessage);
    });

    messaging().onNotificationOpenedApp((remoteMessage) => {
      handleNotificationTap(remoteMessage);
    });

    messaging().getInitialNotification().then((remoteMessage) => {
      if (remoteMessage) handleNotificationTap(remoteMessage);
    });

    return () => unsubscribeForeground();
  }, []);

  const handleNotificationTap = (remoteMessage: any) => {
    const { type, senderId, body } = remoteMessage.data || {};
    if (type === 'chat') {
      setChatNotification({ senderId: senderId || 'Unknown', message: body || '' });
    }
    //  else if (type === 'call' && !incomingCall && myId && senderId) {
    //   navigationRef.current?.navigate('Chat', {
    //     myId,
    //     targetId: senderId as string,
    //     joinCall: true
    //   });
    // }
  };
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (incomingCall) {
          const callId = `${myId}_${incomingCall.callerId}`;
          const incomingCallId = `${incomingCall.callerId}_${myId}`;
          await Promise.all([
            firestore().collection('meet').doc(callId).set({ hangup: true }, { merge: true }),
            firestore().collection('meet').doc(incomingCallId).set({ hangup: true }, { merge: true }),
          ]).catch(error => console.error('Failed to signal hangup:', error));
          await handleHangup();
        }

      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    if (!myId) return;
    console.log('Listening for calls with myId:', myId); // Debug log
    const subscribe = firestore()
      .collection('meet')
      .where('targetId', '==', myId)
      .onSnapshot(snapshot => {
        console.log('Snapshot received:', snapshot.docs.length);
        snapshot.docChanges().forEach(async change => {
          console.log('Change:', change.type, change.doc.data());
          if (change.type === 'added' && !incomingCall && !localStream) {
            const data = change.doc.data();
            if (data.offer && !data.hangup) {
              setIncomingCall({ callerId: data.callerId, callId: change.doc.id, callType: data.callType });
              setGettingCall(true);
              if (ringtoneRef.current) {
                ringtoneRef.current.setNumberOfLoops(-1); // Loop indefinitely
                ringtoneRef.current.play((success) => {
                  if (!success) console.error('Ringtone playback failed');
                });
              }
            }
          } else if (change.type === 'modified') {
            const data = change.doc.data();
            if (data.hangup) {
              setIncomingCall(null);
              setGettingCall(false);
              if (pc.current) pc.current.close();
              pc.current = new RTCPeerConnection(configuration);
              await streamCleanup();
            }
          }
        });
      }, error => console.error('Firestore listener error:', error),
      );
    return () => {
      if (ringtoneRef.current) ringtoneRef.current!.release();
      subscription.remove();
      subscribe();
    }
  }, [myId, incomingCall, localStream,]);

  const handleAccept = async (callType?: string) => {
    if (incomingCall) {
      setGettingCall(false)
      if (ringtoneRef.current) ringtoneRef.current.stop();
      await setupCall(callType);
      if (callType === 'audio' || callType === 'video' || callType === undefined) {
        setIncomingCall({ ...incomingCall, callType, accepted: true });
      } else {
        console.error('Invalid callType:', callType);
      }
    }
  };

  const setupCall = async (callType?: string) => {
    connecting.current = true;
    const callId = incomingCall!.callId;
    const cref = firestore().collection('meet').doc(callId);

    const waitForOffer = async () => {
      const doc = await cref.get();
      return { offer: doc.data()?.offer, callType: doc.data()?.callType || 'video' };
    };

    try {
      if (pc.current) pc.current.close();
      pc.current = new RTCPeerConnection(configuration);
      await streamCleanup();

      const { offer, callType: offerCallType } = await waitForOffer();
      const isAudioOnly = (callType || offerCallType) === 'audio';
      const stream = isAudioOnly ? await Utils.getAudioStream() : await Utils.getStream();
      setLocalStream(stream);
      stream?.getTracks().forEach(track => pc.current.addTrack(track, stream));
      (pc.current as any).ontrack = (event: any) => setRemoteStream(event.streams[0]);

      const startRemoteCandidates = await collectIceCandidates(cref, myId!, incomingCall!.callerId);
      await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      await cref.update({ answer: { type: answer.type, sdp: answer.sdp }, hangup: false });
      startRemoteCandidates();
    } catch (error) {
      console.error('Setup call error:', error);
      handleHangup();
    }
  };

  const handleHangup = async () => {
    if (incomingCall) {
      const cref = firestore().collection('meet').doc(incomingCall.callId);
      await cref.update({ hangup: true }).catch(error => console.error('Hangup error:', error));
      await streamCleanup();
      if (pc.current) pc.current.close();
      pc.current = new RTCPeerConnection(configuration);
      setIncomingCall(null);
      setGettingCall(false);
      if (ringtoneRef.current) ringtoneRef.current.stop();
      await firestoreCleanup(incomingCall.callId);
    }
  };

  const streamCleanup = async () => {

    const stopTracks = (mediaStream: MediaStream | null) => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
    stopTracks(localStream!)
    stopTracks(remoteStream!)

    if (pc.current) {
      pc.current?.getSenders().forEach(sender => {
        console.log("TRACKSSSSS", sender.track)
        if (sender.track) {
          sender.track.stop();
        }
        pc.current?.removeTrack(sender);
      });
    }
    setLocalStream(null);
    setRemoteStream(null);
  };

  const firestoreCleanup = async (callId: string) => {
    const cref = firestore().collection('meet').doc(callId);
    try {
      const [callerCandidates, calleeCandidates] = await Promise.all([
        cref.collection(myId || 'caller').get(),
        cref.collection(incomingCall?.callerId || 'callee').get(),
      ]);
      const deletePromises = [];
      callerCandidates.docs.forEach(doc => deletePromises.push(doc.ref.delete()));
      calleeCandidates.docs.forEach(doc => deletePromises.push(doc.ref.delete()));
      deletePromises.push(cref.delete());
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Firestore cleanup error:', error);
    }
  };
  const collectIceCandidates = async (cref: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
    localName: string,
    remoteName: string) => {
    const candidateCollection = cref.collection(localName);
    if (pc.current) {
      (pc.current as any).onicecandidate = (event: any) => {
        if (event.candidate) candidateCollection.add(event.candidate);
      };
    }
    return () => {
      cref.collection(remoteName).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.current?.addIceCandidate(candidate);
          }
        });
      });
    };
  };

  notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    sound: 'default',
  });

  const handleChatDismiss = () => {
    setChatNotification(null);
  };

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="Splash">

        <Stack.Screen
          name="LoginScreen"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
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
        <Stack.Screen name="Chat" component={ChatScreen}
          options={{ headerShown: false }} />
      </Stack.Navigator>

      {incomingCall && (
        <Modal transparent visible={!!incomingCall} animationType="slide">
          {gettingCall ? (
            <GettingCallOverlay
              callType={incomingCall.callType}
              callerId={incomingCall.callerId}
              onAccept={() => handleAccept(incomingCall.callType)}
              onHangup={handleHangup}
              navigation={navigationRef.current!}
            />
          ) : localStream ? (
            incomingCall.callType === 'audio' ? (
              <AudioCallScreen
                hangup={handleHangup}
                localStream={localStream}
                remoteStream={remoteStream}
              />
            ) : (
              <Video
                hangup={handleHangup}
                localStream={localStream}
                remoteStream={remoteStream}
              />
            )
          ) : null}
        </Modal>
      )}

      {chatNotification && (
        <ChatNotificationOverlay
          senderId={chatNotification.senderId}
          message={chatNotification.message}
          onDismiss={handleChatDismiss}
        />
      )}

    </NavigationContainer>
  );
}
const styles = StyleSheet.create({
  //for chat notification
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chatNotification: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  chatBody: {
    fontSize: 16,
    marginBottom: 20,
  },
  dismissButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: '#fff',
    marginLeft: 5,
    fontSize: 14,
  },
})