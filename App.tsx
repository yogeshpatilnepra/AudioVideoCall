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
import AudioCallScreen from './components/AudioCallScreen';
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
    new RTCPeerConnection()
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

      if (!snapshot.exists || (data && data.hangup)) {
        console.log("Detected hangup signal from Firestore");
        hangup();
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
      const remoteStream = event.streams[0];
      setRemoteStream(remoteStream);
    };
  }
  const create = async () => {
    connecting.current = true;
    setIsAudioCall(false);
    //set up webrtc 
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
        callType: "video"
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
      await cref.set({
        offer: { type: offer.type, sdp: offer.sdp },
        callType: "audio"
      });
    }
  };

  const join = async () => {
    connecting.current = true;
    setGettingCall(false);

    const cref = firestore().collection("meet").doc("chatId");
    const doc = await cref.get();
    const offer = doc.data()?.offer;
    // const offer = (await cref.get()).data()?.offer;

    if (!offer) {
      console.error("No offer found in Firestore for chatId");
      connecting.current = false;
      return;
    }

    try {
      const callType = doc.data()?.callType || "video";;
      const isAudioOnly = callType === "audio";
      setIsAudioCall(isAudioOnly);
      await setupWebrtc(isAudioOnly);
      collectIceCandidates(cref, "callee", "caller");

      if (pc.current) {
        await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
        // create the answer for the call
        //check the paramreters ,its reversed. since the joining part is callee
        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);
        const cWithAnswer = {
          answer: {
            type: answer.type,
            sdp: answer.sdp
          },
        };
        await cref.update(cWithAnswer);
      }
    } catch (error) {
      console.error("Error in join:", error);
      connecting.current = false; // Reset state on error
      await hangup();
    }
  }
  const hangup = async () => {
    console.log("Hangup triggered, stopping streams");
    setGettingCall(false);
    connecting.current = false;
    setIsAudioCall(false);

    await streamCleanup();

    if (pc.current) {
      console.log("Closing peer connection");
      pc.current.close();
      pc.current.restartIce();
      pc.current = new RTCPeerConnection(configuration);
    }

    await firestoreCleanup();
    setLocalStream(null);
    setRemoteStream(null);
    console.log("Hangup completed");
  };

  // const streamCleanup = async () => {
  //   if (localStream) {
  //     localStream.getTracks().forEach(t => t.stop());
  //     localStream?.release();
  //     console.log("LOCALSTREAMMM release", localStream)

  //     pc.current?.getSenders().forEach(sender => {
  //       pc.current?.removeTrack(sender);
  //     });
  //   }
  //   if (remoteStream) {
  //     console.log("REMOTESSTREAMMM release", remoteStream)
  //     remoteStream.getTracks().forEach(t => {
  //       t.stop();
  //     });
  //   }
  //   setLocalStream(null);
  //   setRemoteStream(null);
  // };

  const streamCleanup = async () => {
    console.log("streamCleanup started");
    if (localStream) {
      console.log("Stopping localStream tracks:", localStream);
    
      pc.current.getTransceivers().forEach((transceiver) => {
        console.log("closedd--->",transceiver)
        transceiver.stop();
    });

    localStream.getTracks().forEach(t => {
      t.stop(); // Stop each local track
      console.log("Track stopped:", t);
    });

      // Remove all senders from the peer connection
      // pc.current?.getSenders().forEach(sender => {
      //   console.log("Removing sender:", sender);
      //   pc.current?.removeTrack(sender);
      // });
    }
    // Do not attempt to stop remoteStream tracks here; rely on remote side cleanup
    console.log("remoteStream present but not stopped locally:", remoteStream);
    setLocalStream(null);
    setRemoteStream(null);
    console.log("streamCleanup completed");
  };


  const firestoreCleanup = async () => {
    const cref = firestore().collection("meet").doc("chatId");
    const doc = await cref.get();
    if (doc.exists) {
      await cref.set({ hangup: true }, { merge: true });
      const calleecandidate = await cref.collection("callee").get();
      await Promise.all(calleecandidate.docs.map(candidate => candidate.ref.delete()));

      const callercandidate = await cref.collection("caller").get();
      await Promise.all(callercandidate.docs.map(candidate => candidate.ref.delete()));
      await cref.delete();
    }

    // if (cref) {

    //   // calleecandidate.forEach(async (candidate) => {
    //   //   await candidate.ref.delete();
    //   // })

    //   callercandidate.forEach(async (candidate) => {
    //     await candidate.ref.delete();
    //   })

    // }
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

  if (localStream) {
    return isAudioCall ? (
      <AudioCallScreen hangup={hangup} remoteStream={remoteStream} />
    ) : (
      <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />
    );
    // return <Video hangup={hangup} localStream={localStream} remoteStream={remoteStream} />;
  }

  //displays the call button 
  return (
    <View style={styles.sectionContainer}>
      <Button iconName='video-camera' onPress={create} backgroundColor='grey' />
      <Button iconName='phone' onPress={audioCall} backgroundColor='grey' style={{ marginTop: 0, marginLeft: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    flexDirection: 'row',
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