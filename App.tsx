/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import {
  Colors,
  DebugInstructions,
  Header,
  LearnMoreLinks,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';
import Button from './components/Button';
import GettingCall from './components/GettingCall';
import Video from './components/Video';
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import Utils from './components/Utils';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import RTCTrackEvent from 'react-native-webrtc/lib/typescript/RTCTrackEvent';
import AudioCallScreen from './components/AudioCallScreen';

const configuration = { "iceServers": [{ "url": "stun:stun.1.google.com:19302" }] };
export default function App() {

  const [localStream, setLocalStream] = useState<MediaStream | null>();
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>();
  const [gettingCall, setGettingCall] = useState(false);
  const [isAudioCall, setIsAudioCall] = useState(false);
  const pc = useRef<RTCPeerConnection>(
    new RTCPeerConnection({
    })
  );
  const connecting = useRef(false);

  useEffect(() => {
    const cref = firestore().collection("meet").doc("chatId");
    const subscribe = cref.onSnapshot(snapshot => {
      const data = snapshot.data();

      // on  answer start the call
      if (pc.current && !pc.current.remoteDescription && data && data.answer) {
        pc.current.setRemoteDescription(new RTCSessionDescription(data.answer))
      }

      // if there  is offer for chatid set the getting call flag
      if (data && data.offer && !connecting.current) {
        setGettingCall(true)
      }
    });

    // on delete of collection  call hangup
    //the other side has clicked on hangup
    const subscrbeDelete = cref.collection("callee").onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "removed") {
          hangup();
        }
      })
    })
    return () => {
      subscribe();
      subscrbeDelete();
    }
  }, [])

  const setupWebrtc = async () => {
    pc.current = new RTCPeerConnection(configuration);
    const stream = await Utils.getStream(isAudioCall);

    //get the audio and video stream for the call
    if (stream) {
      setLocalStream(stream)
      stream.getTracks().forEach(track => {
        if (isAudioCall && track.kind === "video") {
          track.enabled = false;
        }
        pc.current?.addTrack(track, stream);
      });
    }
    (pc.current as any).ontrack = (event: any) => {
      const [remoteStream] = event.streams;
      setRemoteStream(event.streams[0]);
    };
  }
  const create = async () => {
    // console.log("Calling")
    setIsAudioCall(false);
    connecting.current = true;
    //set up webrtc 
    await setupWebrtc();
    //documents for the call
    const cref = firestore().collection("meet").doc("chatId");
    collectIceCandidates(cref, "caller", "callee")
    if (pc.current) {
      const offer = await pc.current.createOffer({});
      await pc.current.setLocalDescription(offer);
      // const cWithOffer = {
      //   offer: {
      //     type: offer.type,
      //     sdp: offer.sdp
      //   },
      // };
      await cref.set({ offer })
    }
  }

  const audioCall = async () => {
    setIsAudioCall(true);
    connecting.current = true;
    await setupWebrtc();
    const cref = firestore().collection("meet").doc("chatId");
    collectIceCandidates(cref, "caller", "callee");

    if (pc.current) {
      const offer = await pc.current.createOffer({});
      await pc.current.setLocalDescription(offer);

      // const cWithOffer = {
      //   offer: {
      //     type: offer.type,
      //     sdp: offer.sdp
      //   },
      // };
      await cref.set({ offer });
    }
  }

  const join = async () => {
    connecting.current = true;
    setGettingCall(false);
    const cref = firestore().collection("meet").doc("chatId");
    const offer = (await cref.get()).data()?.offer;
    if (offer) {
      //set up webrtc
      await setupWebrtc();
      // Exchange the ICE Candidates
      // check the paramaters , its reveresd. since the joinig part is callee
      collectIceCandidates(cref, "callee", "caller")
      if (pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
        // create the answer for the call
        //check the paramreters ,its reversed. since the joining part is callee
        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);
        // const cWithAnswer = {
        //   answer: {
        //     type: answer.type,
        //     sdp: answer.sdp
        //   },
        // };
        await cref.update({ answer })
      }
    }

  }
  const hangup = async () => {
    setGettingCall(false)
    connecting.current = false;
    if (pc.current) {
      pc.current.close();
    }
    streamCleanup();
    firestoreCleanup();
  }

  const streamCleanup = async () => {
    // if (localStream) {

    //   localStream.release();
    // }
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
  }

  const firestoreCleanup = async () => {
    const cref = firestore().collection("meet").doc("chatId");

    if (cref) {
      const calleecandidate = await cref.collection("callee").get();
      calleecandidate.forEach(async (candidate) => {
        await candidate.ref.delete();
      })
      const callercandidate = await cref.collection("caller").get();
      callercandidate.forEach(async (candidate) => {
        await candidate.ref.delete();
      })
      await cref.delete();
    }
  }
  //helper function

  const collectIceCandidates = async (
    cref: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
    localName: string,
    remoteName: string
  ) => {
    const candidateCollection = cref.collection(localName);
    if (pc.current) {
      (pc.current as any).onicecandidate = (event: any) => {
        if (event.candidate) {
          candidateCollection.add(event.candidate);
        }
      };

    }
    cref.collection(remoteName).onSnapshot(snapshot => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data())
          pc.current?.addIceCandidate(candidate)
        }
      })
    })
  };

  //Display the gettingcall component
  if (gettingCall) {
    return <GettingCall hangup={hangup} join={join} />
  }
  //display local stream on calling
  // displays both local and remote stream once call is connected
  if (localStream) {

    // if (!isAudioCall) {
    //   return <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />
    // } else {
    //   return <AudioCallScreen hangup={hangup} remoteStream={remoteStream} />
    //   // console.log("Audio Call")
    // }
    return isAudioCall ? (
      <AudioCallScreen hangup={hangup} remoteStream={remoteStream} />
    ) : (
      <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />
    );

    // return <Video
    //   hangup={hangup}
    //   localStream={localStream}
    //   remoteStream={remoteStream} />
  }

  //displays the call button 
  return (
    <View style={styles.sectionContainer}>
      <Button iconName='video-camera' onPress={create} backgroundColor='grey' />
      <Button iconName='microphone' onPress={audioCall} backgroundColor='grey' style={{ marginTop: 10 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    flexDirection: 'column',
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});
