import React, { useEffect, useRef, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Modal } from 'react-native';
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
export default function App() {

  const [myId, setMyId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callId: string; callType?: 'audio' | 'video'; accepted?: boolean } | null>(null);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection>(new RTCPeerConnection(configuration));
  const connecting = useRef(false);
  const [gettingCall, setGettingCall] = useState(false);
  useEffect(() => {
    const loadId = async () => {
      const savedId = await AsyncStorage.getItem('myId');
      if (savedId) setMyId(savedId);
    };
    loadId();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged(user => {
      if (user && !myId) setMyId(user.uid);
    });

    return () => unsubscribeAuth();
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    console.log('Listening for calls with myId:', myId); // Debug log
    const subscribe = firestore()
      .collection('meet')
      .where('targetId', '==', myId)
      .onSnapshot(snapshot => {
        console.log('Snapshot received:', snapshot.docs.length);
        snapshot.docChanges().forEach(change => {
          console.log('Change:', change.type, change.doc.data());
          if (change.type === 'added' && !incomingCall && !localStream) {
            const data = change.doc.data();
            if (data.offer && !data.hangup) {
              setIncomingCall({ callerId: data.callerId, callId: change.doc.id, callType: data.callType });
              setGettingCall(true);
            }
          } else if (change.type === 'modified') {
            const data = change.doc.data();
            if (data.hangup) {
              setIncomingCall(null);
              setGettingCall(false);
              streamCleanup();
            }
          }
        });
      }, error => console.error('Firestore listener error:', error),
      );
    return () => subscribe();
  }, [myId, incomingCall, localStream]);

  const handleAccept = async (callType?: string) => {
    if (incomingCall) {
      setGettingCall(false)
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
      await firestoreCleanup(incomingCall.callId);
    }
  };

  const streamCleanup = async () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());

    const stopTracks = (mediaStream: MediaStream) => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
    stopTracks(localStream!)
    stopTracks(remoteStream!)

    if (pc.current) {
      pc.current?.getSenders().forEach(sender => {
        if (sender.track) sender.track.stop();
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

    </NavigationContainer>
  );
}