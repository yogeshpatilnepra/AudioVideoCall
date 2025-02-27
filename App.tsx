/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View
} from 'react-native';

import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import Button from './components/Button';
import GettingCall from './components/GettingCall';
import Utils from './components/Utils';
import Video from './components/Video';

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

  const setupWebrtc = async (audioOnly = false) => {
    pc.current = new RTCPeerConnection(configuration);
    const stream = audioOnly ? await Utils.getAudioStream() : await Utils.getStream();

    //get the audio and video stream for the call
    if (stream) {
      setLocalStream(stream)
      stream.getTracks().forEach(track => {
        pc.current?.addTrack(track, stream);
      });
    }
    (pc.current as any).ontrack = (event: any) => {
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
    };
  }
  const create = async () => {

    connecting.current = true;
    //set up webrtc 
    setIsAudioCall(false);
    await setupWebrtc();
    //documents for the call
    const cref = firestore().collection("meet").doc("chatId");
    collectIceCandidates(cref, "caller", "callee")
    if (pc.current) {
      const offer = await pc.current.createOffer({});
      pc.current.setLocalDescription(offer);
      const cWithOffer = {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
      };
      await cref.set(cWithOffer)
    }
  }

  const audioCall = async () => {
    connecting.current = true;
    setIsAudioCall(true);
    await setupWebrtc(true);
    const cref = firestore().collection("meet").doc("chatId");
    collectIceCandidates(cref, "caller", "callee");
    if (pc.current) {
      const offer = await pc.current.createOffer({});
      pc.current.setLocalDescription(offer);
      await cref.set({ offer: { type: offer.type, sdp: offer.sdp } });
    }
  }

  const join = async () => {
    connecting.current = true;
    setGettingCall(false);
    const cref = firestore().collection("meet").doc("chatId");
    const offer = (await cref.get()).data()?.offer;
    if (offer) {
      //set up webrtc
      await setupWebrtc(isAudioCall);
      // Exchange the ICE Candidates
      // check the paramaters , its reveresd. since the joinig part is callee
      collectIceCandidates(cref, "callee", "caller")
      if (pc.current) {
        pc.current.setRemoteDescription(new RTCSessionDescription(offer));
        // create the answer for the call
        //check the paramreters ,its reversed. since the joining part is callee
        const answer = await pc.current.createAnswer();
        pc.current.setLocalDescription(answer);
        const cWithAnswer = {
          answer: {
            type: answer.type,
            sdp: answer.sdp
          },
        };
        await cref.update(cWithAnswer);
      }
    }

  }
  const hangup = async () => {
    setGettingCall(false);
    connecting.current = false;
    streamCleanup();
    firestoreCleanup();
    if (pc.current) {
      pc.current.close();
    }
  };

  const streamCleanup = async () => {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream.release();
    }
    setLocalStream(null);
    setRemoteStream(null);
  };

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
  // if (localStream) {
  //   if (!isAudioCall) {
  //     return <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />
  //   } else {
  //     return <AudioCallScreen hangup={hangup} remoteStream={remoteStream} />
  //   }
  // }

  if (localStream) {
    return <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />;
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
